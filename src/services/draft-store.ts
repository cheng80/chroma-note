import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { Draft, DemoOwnerId, SaveAttempt } from '../domain/record';
import { workingFileName } from './draft-path';

export interface DraftState {
  drafts: { new: Draft | null; edit: Draft | null };
  save_attempt: SaveAttempt | null;
}

const dbPromise = SQLite.openDatabaseAsync('chroma-note-drafts.db').then(async (db) => {
  await db.execAsync('CREATE TABLE IF NOT EXISTS draft_state (owner_id TEXT PRIMARY KEY NOT NULL, snapshot TEXT NOT NULL)');
  await db.execAsync('CREATE TABLE IF NOT EXISTS draft_cleanup (owner_id TEXT NOT NULL, uri TEXT NOT NULL, PRIMARY KEY(owner_id, uri))');
  if (Platform.OS === 'ios') {
    const directory = new Directory(Paths.document, 'SQLite');
    if (directory.exists) await requireOptionalNativeModule<{ preparePrivateDirectoryAsync(uri: string): Promise<void> }>('ChromaLineArt')?.preparePrivateDirectoryAsync(directory.uri);
  }
  return db;
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripImageCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripImageCredentials);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'image_headers' || key === 'signed_url' || key === 'signedUrl') continue;
    if (key === 'local_uri' && typeof child === 'string' && /[?&](token|signature|expires)=/i.test(child)) continue;
    result[key] = stripImageCredentials(child);
  }
  return result;
}

function recover(state: DraftState): DraftState {
  const drafts = clone(state.drafts);
  for (const draft of Object.values(drafts)) {
    if (draft && ['preparing', 'colors', 'analysis', 'stamp', 'processing'].includes(draft.stage)) {
      draft.stage = 'interrupted';
      draft.error_code = 'interrupted';
    }
  }
  const save_attempt = state.save_attempt ? clone(state.save_attempt) : null;
  if (save_attempt && ['pending', 'uploading', 'finalizing'].includes(save_attempt.state)) {
    save_attempt.state = 'uncertain';
    save_attempt.error_code = 'save_uncertain';
  }
  return { drafts, save_attempt };
}

function rehomeWorkingFiles(ownerId: string, state: DraftState): DraftState {
  const next = clone(state);
  const directory = new Directory(Paths.document, 'chroma-drafts', ownerId);
  directory.create({ intermediates: true, idempotent: true });
  const rehome = (image: { source: string; local_uri: string } | null | undefined) => {
    if (!image || image.source !== 'device' || image.local_uri.startsWith(directory.uri)) return;
    const name = workingFileName(ownerId, image.local_uri);
    if (!name) return;
    try {
      const source = new File(image.local_uri);
      const target = new File(directory, name);
      if (!target.exists && source.exists) source.copy(target);
      if (target.exists) image.local_uri = target.uri;
    } catch { /* Keep the old URI so recovery never discards a draft reference. */ }
  };
  for (const draft of Object.values(next.drafts)) {
    if (!draft) continue;
    rehome(draft.photo);
    rehome(draft.selected_candidate);
    rehome(draft.pending_candidate);
  }
  rehome(next.save_attempt?.payload_snapshot.stamp);
  return next;
}

function belongsTo(ownerId: DemoOwnerId, state: DraftState) {
  return Object.values(state.drafts).every((draft) => !draft || draft.owner_id === ownerId)
    && (!state.save_attempt || state.save_attempt.owner_id === ownerId);
}

function workingFiles(ownerId: string, state: DraftState): Set<string> {
  const root = new Directory(Paths.document, 'chroma-drafts', ownerId).uri.replace(/\/$/, '') + '/';
  const files = new Set<string>();
  for (const draft of Object.values(state.drafts)) {
    if (!draft) continue;
    for (const image of [draft.photo, draft.selected_candidate, draft.pending_candidate]) {
      if (image?.source === 'device' && image.local_uri.startsWith(root)) files.add(image.local_uri);
    }
  }
  const stamp = state.save_attempt?.payload_snapshot.stamp;
  if (stamp?.source === 'device' && stamp.local_uri.startsWith(root)) files.add(stamp.local_uri);
  return files;
}

/** File deletion only follows a committed snapshot that no longer references it. */
export async function drainDraftCleanup(ownerId: string) {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ uri: string }>('SELECT uri FROM draft_cleanup WHERE owner_id = ?', ownerId);
  const root = new Directory(Paths.document, 'chroma-drafts', ownerId).uri.replace(/\/$/, '') + '/';
  for (const { uri } of rows) {
    try {
      const parsed = new URL(uri);
      const row = await db.getFirstAsync<{ snapshot: string }>('SELECT snapshot FROM draft_state WHERE owner_id = ?', ownerId);
      if (row && workingFiles(ownerId, JSON.parse(row.snapshot)).has(uri)) continue;
      if (uri.startsWith(root) && parsed.protocol === 'file:' && !parsed.host && !parsed.search && !parsed.hash && !decodeURIComponent(parsed.pathname).split('/').includes('..')) {
        const file = new File(uri);
        if (file.exists) file.delete();
      }
      await db.runAsync('DELETE FROM draft_cleanup WHERE owner_id = ? AND uri = ?', ownerId, uri);
    } catch { /* Retain the cleanup job for the next foreground/restart. */ }
  }
}

export async function readDraftState(ownerId: DemoOwnerId): Promise<DraftState | null> {
  const db = await dbPromise;
  const row = await db.getFirstAsync<{ snapshot: string }>('SELECT snapshot FROM draft_state WHERE owner_id = ?', ownerId);
  if (!row) return null;
  try {
    const value = JSON.parse(row.snapshot) as DraftState;
    if (!value || !value.drafts || !('new' in value.drafts) || !('edit' in value.drafts) || !belongsTo(ownerId, value)) return null;
    const recovered = recover(value);
    const rehomed = rehomeWorkingFiles(ownerId, recovered);
    if (JSON.stringify(rehomed) !== JSON.stringify(recovered)) {
      await db.runAsync('UPDATE draft_state SET snapshot = ? WHERE owner_id = ?', JSON.stringify(stripImageCredentials(rehomed)), ownerId);
    }
    return rehomed;
  } catch {
    return null;
  }
}

export async function writeDraftState(ownerId: DemoOwnerId, state: DraftState): Promise<void> {
  const safe = clone(state);
  if (!belongsTo(ownerId, safe)) throw new Error('Draft state belongs to another account.');
  if (safe.save_attempt && ['saved', 'demo_saved'].includes(safe.save_attempt.state)) safe.save_attempt = null;
  const snapshot = JSON.stringify(stripImageCredentials(safe));
  const db = await dbPromise;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const previous = await transaction.getFirstAsync<{ snapshot: string }>('SELECT snapshot FROM draft_state WHERE owner_id = ?', ownerId);
    const remaining = workingFiles(ownerId, safe);
    if (previous) {
      for (const uri of workingFiles(ownerId, JSON.parse(previous.snapshot))) {
        if (!remaining.has(uri)) await transaction.runAsync('INSERT OR IGNORE INTO draft_cleanup (owner_id, uri) VALUES (?, ?)', ownerId, uri);
      }
    }
    await transaction.runAsync('INSERT OR REPLACE INTO draft_state (owner_id, snapshot) VALUES (?, ?)', ownerId, snapshot);
  });
  await drainDraftCleanup(ownerId);
}

export async function clearDraftState(ownerId: DemoOwnerId): Promise<void> {
  const db = await dbPromise;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const previous = await transaction.getFirstAsync<{ snapshot: string }>('SELECT snapshot FROM draft_state WHERE owner_id = ?', ownerId);
    if (previous) for (const uri of workingFiles(ownerId, JSON.parse(previous.snapshot))) await transaction.runAsync('INSERT OR IGNORE INTO draft_cleanup (owner_id, uri) VALUES (?, ?)', ownerId, uri);
    await transaction.runAsync('DELETE FROM draft_state WHERE owner_id = ?', ownerId);
  });
  await drainDraftCleanup(ownerId);
}
