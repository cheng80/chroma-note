import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';

const serviceDirectory = new URL('.', import.meta.url);
const root = mkdtempSync(join(tmpdir(), 'chroma-record-cache-native-'));
const mock = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const modules = {
  'expo-sqlite': mock(`
    import { DatabaseSync } from 'node:sqlite';
    const raw = new DatabaseSync(':memory:');
    let tail = Promise.resolve();
    const lock = async (task) => {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { raw.exec('BEGIN IMMEDIATE'); const result = await task(api); raw.exec('COMMIT'); return result; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
      finally { release(); }
    };
    export const __testing = { failInsert: false, pauseCleanup: null, cleanupLocked: null, afterLogoutGeneration: null, query(sql, ...params) { return raw.prepare(sql).all(...params); } };
    const api = {
      async execAsync(sql) { raw.exec(sql); },
      async runAsync(sql, ...params) {
        if (__testing.pauseCleanup && sql.startsWith('UPDATE record_cache_cleanup SET path = path')) {
          __testing.cleanupLocked?.();
          await __testing.pauseCleanup;
        }
        if (__testing.failInsert && sql.includes('INSERT OR REPLACE INTO record_cache')) {
          __testing.failInsert = false;
          throw new Error('forced cache insert failure');
        }
        if (sql.startsWith('UPDATE record_cache_owner SET generation = generation + 1')) __testing.afterLogoutGeneration?.();
        return raw.prepare(sql).run(...params);
      },
      async getFirstAsync(sql, ...params) { return raw.prepare(sql).get(...params); },
      async getAllAsync(sql, ...params) { return raw.prepare(sql).all(...params); },
      async withExclusiveTransactionAsync(task) { return lock(task); },
    };
    export async function openDatabaseAsync() { return api; }
  `),
  'expo-file-system': mock(`
    import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    import { join } from 'node:path';
    export const __testing = { root: ${JSON.stringify(root)}, downloads: 0, waitDownload: null, downloadStarted: null };
    const pathFor = (value) => value.startsWith('file:') ? fileURLToPath(value) : value;
    export const Paths = { document: __testing.root };
    export class Directory {
      constructor(...parts) { this.path = join(...parts.map((part) => part instanceof Directory ? part.path : pathFor(part))); this.uri = pathToUri(this.path); }
      get exists() { return existsSync(this.path); }
      create() { mkdirSync(this.path, { recursive: true }); }
      delete() { rmSync(this.path, { recursive: true, force: true }); }
    }
    const pathToUri = (path) => 'file://' + path;
    export class File {
      constructor(parent, name) { this.path = name === undefined ? pathFor(parent) : join(parent.path, name); this.uri = pathToUri(this.path); }
      get exists() { return existsSync(this.path); }
      get size() { return this.exists ? statSync(this.path).size : 0; }
      async bytes() { return new Uint8Array(readFileSync(this.path)); }
      async move(destination, options = {}) { mkdirSync(join(destination.path, '..'), { recursive: true }); if (options.overwrite) rmSync(destination.path, { force: true }); renameSync(this.path, destination.path); }
      delete() { rmSync(this.path, { force: true }); }
      static async downloadFileAsync(_uri, destination) {
        __testing.downloadStarted?.();
        if (__testing.waitDownload) await __testing.waitDownload;
        mkdirSync(join(destination.path, '..'), { recursive: true });
        writeFileSync(destination.path, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ++__testing.downloads]));
        return destination;
      }
    }
  `),
  expo: mock('export function requireOptionalNativeModule() { return undefined; }'),
  'expo-crypto': mock('export function randomUUID() { return "test-uuid"; }'),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (modules[specifier]) return { url: modules[specifier], shortCircuit: true };
    if (specifier === './record-cache-core' && context.parentURL === new URL('record-cache.ts', serviceDirectory).href) {
      return { url: new URL('record-cache-core.ts', serviceDirectory).href, format: 'module-typescript', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const cache = await import(new URL('record-cache.ts', serviceDirectory).href);
const sqlite = await import('expo-sqlite');
const filesystem = await import('expo-file-system');
const owner = 'owner-a';
const record = (id = 'record-1') => ({
  source: 'supabase', id, user_id: owner, status: 'ready', version: 1, created_at: '2026-09-12T00:00:00Z', color_tags: [],
  stamp: { candidate_id: id, input_revision: 1, source: 'supabase', local_uri: 'https://example.test/image.png', image_headers: {}, width: 100, height: 100 },
  fields: { diary_date: '2026-09-12', date_source: 'user', place_name: null, user_note: '', scene: null, semantic_tags: [], mood_tags: [], ai_field_note: '', ai_field_note_edited: null, is_favorite: false },
});
const target = (id = 'record-1') => new filesystem.File(new filesystem.Directory(filesystem.Paths.document, 'chroma-record-cache', owner), `${id}.png`);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

try {
  sqlite.__testing.failInsert = true;
  await assert.rejects(cache.cacheRecordImage(owner, record()));
  assert.equal(target().exists, false, 'a failed first write removes its moved target');

  const cleanupGate = deferred();
  const cleanupLocked = deferred();
  sqlite.__testing.pauseCleanup = cleanupGate.promise;
  sqlite.__testing.cleanupLocked = cleanupLocked.resolve;
  sqlite.__testing.failInsert = true;
  const failed = cache.cacheRecordImage(owner, record());
  await cleanupLocked.promise;
  const normal = cache.cacheRecordImage(owner, record());
  cleanupGate.resolve();
  await assert.rejects(failed);
  await normal;
  sqlite.__testing.pauseCleanup = null;
  assert.equal(target().exists, true, 'a queued failed cleanup cannot delete the following committed target');
  assert.equal(sqlite.__testing.query('SELECT record_id FROM record_cache WHERE owner_id = ?', owner).length, 1, 'the following write remains committed');

  await cache.cacheRecordImage(owner, record('record-3'));
  sqlite.__testing.query('INSERT INTO record_cache_cleanup (owner_id, path) VALUES (?, ?)', owner, 'record-3.png');
  await cache.drainRecordCacheCleanup(owner);
  assert.equal(target('record-3').exists, true, 'a queued cleanup keeps a currently referenced cache target');

  let nextGeneration;
  sqlite.__testing.afterLogoutGeneration = () => { nextGeneration = cache.cacheRecordImage(owner, record('record-4')); };
  await cache.clearRecordCache(owner);
  await nextGeneration;
  sqlite.__testing.afterLogoutGeneration = null;
  assert.equal(target('record-4').exists, true, 'star cleanup keeps a next-generation target that committed first');
  assert.equal(sqlite.__testing.query('SELECT record_id FROM record_cache WHERE owner_id = ? AND record_id = ?', owner, 'record-4').length, 1, 'the next-generation cache row remains committed');

  const downloadGate = deferred();
  const downloadStarted = deferred();
  filesystem.__testing.waitDownload = downloadGate.promise;
  filesystem.__testing.downloadStarted = downloadStarted.resolve;
  const stale = cache.cacheRecordImage(owner, record('record-2'));
  await downloadStarted.promise;
  await cache.clearRecordCache(owner);
  downloadGate.resolve();
  await stale;
  filesystem.__testing.waitDownload = null;
  assert.equal(target('record-2').exists, false, 'a pre-logout generation cannot recreate a cleared target');

  await cache.cacheRecordImage(owner, record('record-2'));
  assert.equal(target('record-2').exists, true, 'the next generation can cache after logout cleanup');
  console.log('record-cache.native.check passed: actual service source serializes failed cleanup, writer, and logout generations');
} finally {
  rmSync(root, { recursive: true, force: true });
}
