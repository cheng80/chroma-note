import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';
import { randomUUID } from 'expo-crypto';

import type { BookFilter, DemoOwnerId, DemoRecord } from '../domain/record';
import { cacheRecordSnapshot, cachedRecord, evictedRecordIds, filterCachedRecords, recordCacheFileName } from './record-cache-core';

type CacheRow = {
  record_id: string;
  snapshot: string;
  image_uri: string | null;
  image_bytes: number;
  fetched_at: number;
  accessed_at: number;
};

export type PendingRecordDeletion = {
  record_id: string;
  base_version: number;
  requested_at: number;
};

const dbPromise = SQLite.openDatabaseAsync('chroma-note-record-cache.db').then(async (db) => {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS record_cache (
      owner_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      image_uri TEXT,
      image_bytes INTEGER NOT NULL DEFAULT 0,
      fetched_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, record_id)
    );
    CREATE TABLE IF NOT EXISTS record_cache_cleanup (
      owner_id TEXT NOT NULL,
      path TEXT NOT NULL,
      PRIMARY KEY (owner_id, path)
    );
    CREATE TABLE IF NOT EXISTS record_cache_owner (
      owner_id TEXT PRIMARY KEY NOT NULL,
      generation INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS record_deletion_queue (
      owner_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      base_version INTEGER NOT NULL,
      requested_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, record_id)
    );
    CREATE INDEX IF NOT EXISTS record_cache_lru ON record_cache(owner_id, accessed_at);
  `);
  return db;
});

const activeRecordCacheClears = new Map<DemoOwnerId, Promise<void>>();

function cacheDirectory(ownerId: DemoOwnerId) {
  recordCacheFileName(ownerId, 'cache');
  return new Directory(Paths.document, 'chroma-record-cache', ownerId);
}

function cacheFile(ownerId: DemoOwnerId, recordId: string) {
  return new File(cacheDirectory(ownerId), recordCacheFileName(ownerId, recordId));
}

async function cacheGeneration(ownerId: DemoOwnerId) {
  const db = await dbPromise;
  await db.runAsync('INSERT OR IGNORE INTO record_cache_owner (owner_id) VALUES (?)', ownerId);
  return (await db.getFirstAsync<{ generation: number }>('SELECT generation FROM record_cache_owner WHERE owner_id = ?', ownerId))?.generation ?? 0;
}

async function isCurrentGeneration(transaction: SQLite.SQLiteDatabase, ownerId: DemoOwnerId, generation: number) {
  const row = await transaction.getFirstAsync<{ generation: number }>('SELECT generation FROM record_cache_owner WHERE owner_id = ?', ownerId);
  return row?.generation === generation;
}

async function prepareDirectory(ownerId: DemoOwnerId) {
  const directory = cacheDirectory(ownerId);
  directory.create({ intermediates: true, idempotent: true });
  await requireOptionalNativeModule<{ preparePrivateDirectoryAsync(uri: string): Promise<void> }>('ChromaLineArt')?.preparePrivateDirectoryAsync(directory.uri);
  return directory;
}

function safeCachedUri(ownerId: DemoOwnerId, recordId: string, uri: string | null) {
  return uri === cacheFile(ownerId, recordId).uri ? uri : null;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function pngBytes(file: File) {
  const size = file.size;
  if (!file.exists || size < 8 || size > 5 * 1024 * 1024) throw new Error('Cached image is invalid.');
  return file.bytes().then((bytes) => {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error('Cached image is invalid.');
    return size;
  });
}

async function evict(ownerId: DemoOwnerId) {
  const db = await dbPromise;
  const rows = await db.getAllAsync<Pick<CacheRow, 'record_id' | 'image_bytes' | 'accessed_at'>>(
    'SELECT record_id, image_bytes, accessed_at FROM record_cache WHERE owner_id = ?', ownerId,
  );
  const ids = evictedRecordIds(rows);
  if (!ids.length) return;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const id of ids) {
      await transaction.runAsync('INSERT OR IGNORE INTO record_cache_cleanup (owner_id, path) VALUES (?, ?)', ownerId, recordCacheFileName(ownerId, id));
      await transaction.runAsync('DELETE FROM record_cache WHERE owner_id = ? AND record_id = ?', ownerId, id);
    }
  });
  await drainRecordCacheCleanup(ownerId);
}

/** Deletes only paths generated from the authenticated account and record IDs. */
export async function drainRecordCacheCleanup(ownerId: DemoOwnerId) {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ path: string }>('SELECT path FROM record_cache_cleanup WHERE owner_id = ?', ownerId);
  for (const { path } of rows) {
    try {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('UPDATE record_cache_cleanup SET path = path WHERE owner_id = ? AND path = ?', ownerId, path);
        const queued = await transaction.getFirstAsync<{ path: string }>(
          'SELECT path FROM record_cache_cleanup WHERE owner_id = ? AND path = ?', ownerId, path,
        );
        if (!queued) return;
        if (path === '*') {
          const referenced = await transaction.getFirstAsync<{ present: number }>(
            'SELECT 1 AS present FROM record_cache WHERE owner_id = ? LIMIT 1', ownerId,
          );
          const directory = cacheDirectory(ownerId);
          if (!referenced && directory.exists) directory.delete();
        } else {
          const file = cacheFile(ownerId, path.replace(/\.png$/, ''));
          if (recordCacheFileName(ownerId, path.replace(/\.png$/, '')) !== path) throw new Error('Invalid cache cleanup path.');
          const referenced = await transaction.getFirstAsync<{ image_uri: string }>(
            'SELECT image_uri FROM record_cache WHERE owner_id = ? AND image_uri = ?', ownerId, file.uri,
          );
          if (!referenced && file.exists) file.delete();
        }
        await transaction.runAsync('DELETE FROM record_cache_cleanup WHERE owner_id = ? AND path = ?', ownerId, path);
      });
    } catch { /* Keep cleanup work for the next foreground or account restore. */ }
  }
}

/** Stores server metadata without image URLs or authentication credentials. */
export async function cacheRecords(ownerId: DemoOwnerId, records: DemoRecord[], signal?: AbortSignal) {
  throwIfAborted(signal);
  const db = await dbPromise;
  const generation = await cacheGeneration(ownerId);
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    throwIfAborted(signal);
    if (!await isCurrentGeneration(transaction, ownerId, generation)) return;
    for (const record of records) {
      const snapshot = JSON.stringify(cacheRecordSnapshot(ownerId, record));
      const previous = await transaction.getFirstAsync<Pick<CacheRow, 'image_uri' | 'image_bytes' | 'accessed_at'>>(
        'SELECT image_uri, image_bytes, accessed_at FROM record_cache WHERE owner_id = ? AND record_id = ?', ownerId, record.id,
      );
      const imageUri = safeCachedUri(ownerId, record.id, previous?.image_uri ?? null);
      await transaction.runAsync(
        `INSERT OR REPLACE INTO record_cache (owner_id, record_id, snapshot, image_uri, image_bytes, fetched_at, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ownerId, record.id, snapshot, imageUri, imageUri ? previous?.image_bytes ?? 0 : 0, now, imageUri ? previous?.accessed_at ?? now : now,
      );
    }
  });
}

/** Returns cached metadata even when an image is unavailable, so the UI can show its normal image fallback. */
export async function readRecordCache(ownerId: DemoOwnerId, filter: BookFilter): Promise<DemoRecord[]> {
  await drainRecordCacheCleanup(ownerId);
  const db = await dbPromise;
  const rows = await db.getAllAsync<CacheRow>('SELECT * FROM record_cache WHERE owner_id = ? ORDER BY accessed_at DESC', ownerId);
  const now = Date.now();
  const records: DemoRecord[] = [];
  for (const row of rows) {
    const uri = safeCachedUri(ownerId, row.record_id, row.image_uri);
    try {
      const localUri = uri && new File(uri).exists ? uri : '';
      if (!localUri && uri) await db.runAsync('UPDATE record_cache SET image_uri = NULL, image_bytes = 0 WHERE owner_id = ? AND record_id = ?', ownerId, row.record_id);
      const record = cachedRecord(ownerId, JSON.parse(row.snapshot), localUri);
      if (!record) throw new Error('Invalid cached record.');
      records.push(record);
      await db.runAsync('UPDATE record_cache SET accessed_at = ? WHERE owner_id = ? AND record_id = ?', now, ownerId, row.record_id);
    } catch {
      await removeCachedRecord(ownerId, row.record_id);
    }
  }
  return filterCachedRecords(records, filter).sort((a, b) =>
    b.fields.diary_date.localeCompare(a.fields.diary_date)
    || b.created_at.localeCompare(a.created_at)
    || b.id.localeCompare(a.id),
  );
}

/** Downloads one authenticated ready image, then commits its credential-free record snapshot. */
export async function cacheRecordImage(ownerId: DemoOwnerId, record: DemoRecord, signal?: AbortSignal): Promise<DemoRecord> {
  await activeRecordCacheClears.get(ownerId);
  throwIfAborted(signal);
  const snapshot = cacheRecordSnapshot(ownerId, record);
  const generation = await cacheGeneration(ownerId);
  const directory = await prepareDirectory(ownerId);
  const target = cacheFile(ownerId, record.id);
  const temporary = new File(directory, `${recordCacheFileName(ownerId, record.id)}.${randomUUID()}.tmp`);
  let movedTarget = false;
  try {
    const file = await File.downloadFileAsync(record.stamp.local_uri, temporary, { headers: record.stamp.image_headers, signal });
    const imageBytes = await pngBytes(file);
    const now = Date.now();
    const db = await dbPromise;
    let committed = false;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      throwIfAborted(signal);
      if (!await isCurrentGeneration(transaction, ownerId, generation)) return;
      await transaction.runAsync('UPDATE record_cache_owner SET generation = generation WHERE owner_id = ?', ownerId);
      movedTarget = true;
      await file.move(target, { overwrite: true });
      await transaction.runAsync(
        `INSERT OR REPLACE INTO record_cache (owner_id, record_id, snapshot, image_uri, image_bytes, fetched_at, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ownerId, record.id, JSON.stringify(snapshot), target.uri, imageBytes, now, now,
      );
      committed = true;
    });
    if (!committed) {
      if (temporary.exists) temporary.delete();
      return record;
    }
    if (temporary.exists) temporary.delete();
    await evict(ownerId);
    return cachedRecord(ownerId, snapshot, target.uri) ?? record;
  } catch (error) {
    if (temporary.exists) temporary.delete();
    if (movedTarget) {
      try {
        const db = await dbPromise;
        await db.withExclusiveTransactionAsync(async (transaction) => {
          await transaction.runAsync(
            'INSERT OR IGNORE INTO record_cache_cleanup (owner_id, path) VALUES (?, ?)', ownerId, recordCacheFileName(ownerId, record.id),
          );
        });
        await drainRecordCacheCleanup(ownerId);
      } catch { /* Keep the original cache failure; queued cleanup runs on the next foreground when possible. */ }
    }
    throw error;
  }
}

/** Caches a ready page for a later offline view. Downloads run sequentially to avoid a burst of authenticated requests. */
export async function cacheReadyRecords(ownerId: DemoOwnerId, records: DemoRecord[], filter: BookFilter, signal?: AbortSignal) {
  await cacheRecords(ownerId, records, signal);
  const cached: DemoRecord[] = [];
  for (const record of records) {
    throwIfAborted(signal);
    try { cached.push(await cacheRecordImage(ownerId, record, signal)); }
    catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      cached.push(record);
    }
  }
  return filterCachedRecords(cached, filter);
}

/** Call only after a complete, unfiltered server listing has supplied every currently ready record ID. */
export async function pruneCachedRecords(ownerId: DemoOwnerId, liveIds: string[], signal?: AbortSignal) {
  throwIfAborted(signal);
  const ids = new Set(liveIds.map((id) => recordCacheFileName(ownerId, id).replace(/\.png$/, '')));
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ record_id: string }>('SELECT record_id FROM record_cache WHERE owner_id = ?', ownerId);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    throwIfAborted(signal);
    for (const { record_id } of rows) {
      if (ids.has(record_id)) continue;
      await transaction.runAsync('INSERT OR IGNORE INTO record_cache_cleanup (owner_id, path) VALUES (?, ?)', ownerId, recordCacheFileName(ownerId, record_id));
      await transaction.runAsync('DELETE FROM record_cache WHERE owner_id = ? AND record_id = ?', ownerId, record_id);
    }
  });
  await drainRecordCacheCleanup(ownerId);
}

/** Call after a server-confirmed record deletion. */
export async function removeCachedRecord(ownerId: DemoOwnerId, recordId: string) {
  const fileName = recordCacheFileName(ownerId, recordId);
  const db = await dbPromise;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('INSERT OR IGNORE INTO record_cache_cleanup (owner_id, path) VALUES (?, ?)', ownerId, fileName);
    await transaction.runAsync('DELETE FROM record_cache WHERE owner_id = ? AND record_id = ?', ownerId, recordId);
  });
  await drainRecordCacheCleanup(ownerId);
}

/** Stores an offline delete intent before the remote request. It contains no record content or credentials. */
export async function queueRecordDeletion(ownerId: DemoOwnerId, recordId: string, baseVersion: number) {
  recordCacheFileName(ownerId, recordId);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) throw new Error('Invalid record deletion version.');
  const db = await dbPromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO record_deletion_queue (owner_id, record_id, base_version, requested_at)
     VALUES (?, ?, ?, ?)`,
    ownerId, recordId, baseVersion, Date.now(),
  );
}

/** Parent drains these after account recovery or refresh, then confirms each one remotely. */
export async function readRecordDeletions(ownerId: DemoOwnerId): Promise<PendingRecordDeletion[]> {
  const db = await dbPromise;
  return db.getAllAsync<PendingRecordDeletion>(
    'SELECT record_id, base_version, requested_at FROM record_deletion_queue WHERE owner_id = ? ORDER BY requested_at', ownerId,
  );
}

/** Call only after the server confirms deletion or confirms the record is already absent. */
export async function removeRecordDeletion(ownerId: DemoOwnerId, recordId: string) {
  recordCacheFileName(ownerId, recordId);
  const db = await dbPromise;
  await db.runAsync('DELETE FROM record_deletion_queue WHERE owner_id = ? AND record_id = ?', ownerId, recordId);
}

/** Call during explicit logout after network work has stopped. */
export async function clearRecordCache(ownerId: DemoOwnerId) {
  const previous = activeRecordCacheClears.get(ownerId);
  const clear = (async () => {
    await previous;
    const db = await dbPromise;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync('INSERT OR IGNORE INTO record_cache_owner (owner_id) VALUES (?)', ownerId);
      await transaction.runAsync('UPDATE record_cache_owner SET generation = generation + 1 WHERE owner_id = ?', ownerId);
      await transaction.runAsync('INSERT OR IGNORE INTO record_cache_cleanup (owner_id, path) VALUES (?, ?)', ownerId, '*');
      await transaction.runAsync('DELETE FROM record_cache WHERE owner_id = ?', ownerId);
      await transaction.runAsync('DELETE FROM record_deletion_queue WHERE owner_id = ?', ownerId);
    });
    await drainRecordCacheCleanup(ownerId);
  })();
  activeRecordCacheClears.set(ownerId, clear);
  try { await clear; }
  finally { if (activeRecordCacheClears.get(ownerId) === clear) activeRecordCacheClears.delete(ownerId); }
}
