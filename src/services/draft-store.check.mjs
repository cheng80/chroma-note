import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

// Exercise the real stores against SQLite and real temporary files. Only Expo
// adapters and the browser's sessionStorage surface are replaced in this harness.
const root = mkdtempSync(join(tmpdir(), 'chroma-draft-store-'));
const mock = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const modules = {
  'expo-sqlite': mock(`
    import { DatabaseSync } from 'node:sqlite';
    const raw = new DatabaseSync(':memory:');
    export const __testing = {
      failWrite: false,
      query(sql, ...params) { return raw.prepare(sql).all(...params); },
    };
    const api = {
      async execAsync(sql) { raw.exec(sql); },
      async getFirstAsync(sql, ...params) { return raw.prepare(sql).get(...params); },
      async getAllAsync(sql, ...params) { return raw.prepare(sql).all(...params); },
      async runAsync(sql, ...params) {
        if (__testing.failWrite && /INSERT OR REPLACE INTO draft_state|UPDATE draft_state|DELETE FROM draft_state/.test(sql)) {
          __testing.failWrite = false;
          throw new Error('forced snapshot failure');
        }
        return raw.prepare(sql).run(...params);
      },
      async withExclusiveTransactionAsync(task) {
        raw.exec('BEGIN IMMEDIATE');
        try { await task(api); raw.exec('COMMIT'); }
        catch (error) { raw.exec('ROLLBACK'); throw error; }
      },
    };
    export async function openDatabaseAsync() { return api; }
  `),
  'expo-file-system': mock(`
    import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
    import { fileURLToPath, pathToFileURL } from 'node:url';
    import { join } from 'node:path';
    const pathFor = (value) => value.startsWith('file:') ? fileURLToPath(value) : value;
    export const __testing = { failDelete: false };
    export const Paths = { document: { uri: ${JSON.stringify(pathToFileURL(join(root, 'Documents')).href)} } };
    export class Directory {
      constructor(...parts) { this.path = join(...parts.map((part) => pathFor(part.uri ?? part))); this.uri = pathToFileURL(this.path).href + '/'; }
      get exists() { return existsSync(this.path); }
      create() { mkdirSync(this.path, { recursive: true }); }
    }
    export class File {
      constructor(parent, name) { this.path = name === undefined ? pathFor(parent) : join(parent.path, name); this.uri = pathToFileURL(this.path).href; }
      get exists() { return existsSync(this.path); }
      copy(target) { copyFileSync(this.path, target.path); }
      delete() { if (__testing.failDelete) throw new Error('forced deletion failure'); rmSync(this.path); }
    }
  `),
  expo: mock('export function requireOptionalNativeModule() { return undefined; }'),
  'react-native': mock('export const Platform = { OS: "ios" };'),
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (modules[specifier]) return { url: modules[specifier], shortCircuit: true };
    if (['../domain/draft-collection', './draft-path'].includes(specifier)) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, format: 'module-typescript', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const webRows = new Map();
let failWebWrite = false;
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key) => webRows.get(key) ?? null,
  setItem: (key, value) => { if (failWebWrite) throw new Error('forced storage failure'); webRows.set(key, value); },
  removeItem: (key) => webRows.delete(key),
} });

try {
  const { listDrafts, putDraft, removeDraft, normalizeDraftCollection, persistedDraftCollection } = await import('../domain/draft-collection.ts');
  const native = await import('./draft-store.ts');
  const web = await import('./draft-store.web.ts');
  const sqlite = (await import('expo-sqlite')).__testing;
  const filesystem = (await import('expo-file-system')).__testing;
  const owner = 'owner-a';
  const fields = { diary_date: '2026-09-14', date_source: 'user', place_name: null, user_note: 'preserve my note', scene: null, semantic_tags: [], mood_tags: [], ai_field_note: '', ai_field_note_edited: null, is_favorite: false };
  const image = (uri = 'file:///unmanaged/photo.png') => ({ source: 'device', local_uri: uri, width: 100, height: 100, input_revision: 1, candidate_id: 'candidate-1' });
  const draft = (id, kind = 'edit', extra = {}) => ({ draft_id: `draft-${id}`, owner_id: owner, record_id: id, kind, input_revision: 1, stage: 'summary', photo: image(), colors: null, analysis: null, selected_candidate: image(), pending_candidate: image(), confirmation: null, fields: { ...fields }, ...extra });
  const attempt = (stamp = image(), state = 'uploading') => ({ operation_id: 'operation-1', draft_id: 'draft-a', record_id: 'a', owner_id: owner, state, payload_snapshot: { stamp, fields, color_tags: [], confirmation: null } });
  const empty = () => ({ new: null, edits: {} });
  const state = (drafts = empty(), save_attempt = null) => ({ drafts, save_attempt });
  const a = draft('a');
  const b = draft('b');
  const n = draft('new', 'new');
  const collection = { new: n, edits: { a, b } };

  assert.deepEqual(listDrafts(collection), [n, a, b]);
  assert.deepEqual(normalizeDraftCollection({ new: n, edit: a }), { new: n, edits: { a } });
  assert.deepEqual(normalizeDraftCollection({ new: n, edit: a, edits: { b } }), collection);
  assert.deepEqual(normalizeDraftCollection({ ...collection, edit: structuredClone(a) }), collection);
  const frozen = Object.freeze({ new: n, edits: Object.freeze({ a, b }) });
  const editInitialFields = { ...fields, user_note: 'original before editing', semantic_tags: ['original tag'] };
  const transientA = Object.freeze({ ...a, transient_edit: true, edit_initial_fields: editInitialFields });
  const transientB = Object.freeze({ ...b, transient_edit: true });
  const legacy = draft('legacy');
  const runtime = Object.freeze({ new: n, edits: Object.freeze({ a: transientA, b: transientB, legacy }) });
  assert.deepEqual(persistedDraftCollection(runtime, null), { new: n, edits: { legacy } });
  assert.deepEqual(persistedDraftCollection(runtime, attempt()), { new: n, edits: { a: transientA, legacy } });
  assert.deepEqual(Object.keys(runtime.edits), ['a', 'b', 'legacy'], 'persistence filtering does not mutate runtime');
  assert.deepEqual(persistedDraftCollection({ new: { ...n, transient_edit: true }, edits: { a: { ...a, transient_edit: false } } }, null), { new: { ...n, transient_edit: true }, edits: { a: { ...a, transient_edit: false } } }, 'only explicitly transient edits are filtered');
  assert.deepEqual(putDraft(frozen, draft('c')).edits, { a, b, c: draft('c') });
  assert.equal(putDraft(frozen, draft('replacement', 'new')).new.record_id, 'replacement');
  assert.deepEqual(removeDraft(frozen, a), { new: n, edits: { b } });
  assert.deepEqual(removeDraft(frozen, n), { new: null, edits: { a, b } });
  assert.strictEqual(removeDraft(frozen, { ...a, draft_id: 'stale' }), frozen);
  assert.strictEqual(removeDraft(frozen, { ...n, draft_id: 'stale' }), frozen);
  const special = draft('__proto__');
  assert.deepEqual(listDrafts(normalizeDraftCollection({ new: null, edit: special })), [special]);
  assert.deepEqual(removeDraft(putDraft(empty(), special), special), empty());
  for (const malformed of [null, [], {}, { new: null, edits: [] }, { new: a, edits: {} }, { new: null, edits: { wrong: a } }, { new: null, edits: { a: null } }, { new: null, edit: a, edits: { a: { ...a, fields: { ...fields, user_note: 'conflicting' } } } }]) {
    assert.throws(() => normalizeDraftCollection(malformed));
  }

  // Let the native module finish creating its tables before raw fixture inserts.
  await native.readDraftState(owner);
  const nativeRaw = (id) => sqlite.query('SELECT snapshot FROM draft_state WHERE owner_id = ?', id)[0]?.snapshot;
  const seedNative = (id, value) => sqlite.query('INSERT OR REPLACE INTO draft_state (owner_id, snapshot) VALUES (?, ?)', id, JSON.stringify(value));
  const key = (id) => `chroma-note.drafts.limited.${id}`;
  for (const [label, store, seed, raw] of [
    ['native', native, seedNative, nativeRaw],
    ['web', web, (id, value) => webRows.set(key(id), JSON.stringify(value)), (id) => webRows.get(key(id))],
  ]) {
    for (const drafts of [{ new: n, edit: a }, { new: n, edit: a, edits: { b } }, collection]) {
      seed(owner, state(drafts));
      const recovered = await store.readDraftState(owner);
      assert.deepEqual(recovered.drafts, normalizeDraftCollection(drafts), `${label}: lossless migration`);
      assert.deepEqual(JSON.parse(raw(owner)).drafts, recovered.drafts, `${label}: persisted normalized format`);
    }
    await store.writeDraftState(owner, state(putDraft(empty(), special)));
    assert.deepEqual(listDrafts((await store.readDraftState(owner)).drafts), [special], `${label}: record keys are not object prototype setters`);
    const processing = { new: { ...n, stage: 'preparing' }, edits: { a: { ...a, stage: 'analysis' }, b: { ...b, stage: 'stamp' } } };
    await store.writeDraftState(owner, state(processing, attempt()));
    const recovered = await store.readDraftState(owner);
    assert.ok(listDrafts(recovered.drafts).every((entry) => entry.stage === 'interrupted' && entry.error_code === 'interrupted'));
    assert.equal(recovered.save_attempt.state, 'uncertain');
    assert.equal(processing.edits.b.stage, 'stamp', 'recovery never mutates the caller');
    assert.equal(await store.readDraftState('owner-b'), null);
    const foreign = { ...b, owner_id: 'owner-b' };
    for (const invalid of [
      state({ new: null, edits: { a, b: foreign } }),
      state({ new: null, edits: { a, b: { ...foreign, transient_edit: true } } }),
      state({ new: null, edit: foreign, edits: { a } }),
      state({ new: null, edit: { ...a, owner_id: 'owner-b' }, edits: { a } }),
      state(collection, { ...attempt(), owner_id: 'owner-b' }),
      state({ new: null, edits: { a: null } }),
    ]) {
      const beforeWrite = raw(owner);
      await assert.rejects(store.writeDraftState(owner, invalid));
      assert.equal(raw(owner), beforeWrite, `${label}: rejected writes preserve the snapshot`);
      seed(owner, invalid);
      const beforeRead = raw(owner);
      assert.equal(await store.readDraftState(owner), null);
      assert.equal(raw(owner), beforeRead, `${label}: rejected migration preserves the original`);
    }
    seed(owner, state());
    const signed = { ...image('https://example.test/image?token=secret'), image_headers: { Authorization: 'secret' }, signed_url: 'secret', signedUrl: 'secret' };
    const credentials = state({ new: { ...n, selected_candidate: signed }, edits: { a, b: { ...b, pending_candidate: signed } } }, attempt(signed));
    await store.writeDraftState(owner, credentials);
    assert.ok(!/secret|image_headers|signed_url|signedUrl/.test(raw(owner)), `${label}: all image credentials stripped`);
    assert.ok(credentials.drafts.edits.b.pending_candidate.image_headers, 'sanitizing does not mutate the caller');
    for (const settled of ['saved', 'demo_saved']) {
      await store.writeDraftState(owner, state(collection, attempt(image(), settled)));
      assert.equal(JSON.parse(raw(owner)).save_attempt, null);
    }
    // Restart is represented by reading only the persisted snapshot, with no runtime state.
    await store.writeDraftState(owner, state(runtime));
    assert.deepEqual((await store.readDraftState(owner)).drafts, { new: n, edits: { legacy } }, `${label}: ordinary new edits do not return after restart`);
    assert.deepEqual(Object.keys(runtime.edits), ['a', 'b', 'legacy'], `${label}: the runtime collection remains intact`);
    for (const status of ['pending', 'uploading', 'finalizing', 'uncertain', 'failed', 'conflict']) {
      await store.writeDraftState(owner, state(runtime, attempt(image(), status)));
      const restored = await store.readDraftState(owner);
      assert.deepEqual(restored.drafts, { new: n, edits: { a: transientA, legacy } }, `${label}: ${status} preserves only the matching transient edit`);
      assert.deepEqual(restored.drafts.edits.a.edit_initial_fields, editInitialFields, `${label}: ${status} preserves the baseline for discard confirmation after recovery`);
      assert.equal(restored.save_attempt.state, ['pending', 'uploading', 'finalizing'].includes(status) ? 'uncertain' : status);
    }
    await store.writeDraftState(owner, state(runtime, { ...attempt(), draft_id: 'another-draft-for-a' }));
    assert.deepEqual((await store.readDraftState(owner)).drafts, { new: n, edits: { legacy } }, `${label}: matching record ID alone cannot retain a transient edit`);
    for (const settled of ['saved', 'demo_saved']) {
      await store.writeDraftState(owner, state(runtime, attempt(image(), settled)));
      assert.deepEqual(await store.readDraftState(owner), state({ new: n, edits: { legacy } }), `${label}: settled saves release transient recovery edits`);
    }
    // Normalize old/mixed snapshots before applying the transient persistence policy.
    seed(owner, state({ new: n, edit: a, edits: { b } }));
    const priorEdits = await store.readDraftState(owner);
    await store.writeDraftState(owner, priorEdits);
    assert.deepEqual((await store.readDraftState(owner)).drafts, collection, `${label}: unmarked saved work survives normal writes`);
    await store.writeDraftState(owner, state({ new: n, edit: transientA, edits: { b } }));
    assert.deepEqual((await store.readDraftState(owner)).drafts, { new: n, edits: { b } }, `${label}: opening one old edit does not drop the other old work`);
    await store.writeDraftState(owner, state(removeDraft({ new: n, edits: { b } }, b)));
    assert.deepEqual((await store.readDraftState(owner)).drafts, { new: n, edits: {} }, `${label}: explicit removal still discards old work`);
    const other = state({ new: null, edits: { b: foreign } });
    await store.writeDraftState('owner-b', other);
    await store.clearDraftState(owner);
    assert.equal(await store.readDraftState(owner), null);
    assert.deepEqual((await store.readDraftState('owner-b')).drafts, other.drafts);
    await store.clearDraftState('owner-b');
    console.log(`${label}: migration, transient restart exclusion, unresolved save recovery, legacy preservation, account isolation, credentials, clear passed`);
  }

  const makeFile = (name, id = owner, container = 'Documents') => {
    const path = join(root, container, 'chroma-drafts', id, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name);
    return pathToFileURL(path).href;
  };
  const fileDraft = (id, container = 'Documents') => draft(id, 'edit', {
    photo: image(makeFile(`${id}-photo.jpg`, owner, container)),
    selected_candidate: image(makeFile(`${id}-selected.png`, owner, container)),
    pending_candidate: image(makeFile(`${id}-pending.png`, owner, container)),
  });
  const fileUris = (entry) => [entry.photo.local_uri, entry.selected_candidate.local_uri, entry.pending_candidate.local_uri];
  const exists = (uri) => existsSync(new URL(uri));
  const fileA = fileDraft('file-a');
  const fileB = fileDraft('file-b');
  const fileNew = { ...fileDraft('file-new'), kind: 'new' };
  const files = { new: fileNew, edits: { 'file-a': fileA, 'file-b': fileB } };
  seedNative(owner, state({ new: fileNew, edit: fileA, edits: { 'file-b': fileB } }, attempt(fileA.selected_candidate)));
  const beforeMigration = nativeRaw(owner);
  sqlite.failWrite = true;
  const restoredAfterFailure = await native.readDraftState(owner);
  assert.deepEqual(restoredAfterFailure.drafts, files, 'failed migration still returns every recovered draft');
  assert.equal(restoredAfterFailure.save_attempt.state, 'uncertain');
  assert.equal(nativeRaw(owner), beforeMigration, 'failed migration preserves the original snapshot');
  assert.ok(listDrafts(files).flatMap(fileUris).every(exists), 'failed migration leaves all referenced files intact');
  assert.equal(sqlite.query('SELECT * FROM draft_cleanup').length, 0, 'failed migration does not enqueue file deletion');
  const continued = { ...fileA, fields: { ...fields, user_note: 'continue after migration failure' } };
  await native.writeDraftState(owner, { ...restoredAfterFailure, drafts: putDraft(restoredAfterFailure.drafts, continued) });
  assert.deepEqual(JSON.parse(nativeRaw(owner)).drafts, putDraft(files, continued), 'the next user edit keeps the other restored drafts');
  assert.ok(listDrafts(files).flatMap(fileUris).every(exists), 'writing after failed migration retains all live files');
  await native.writeDraftState(owner, state(files));
  const before = nativeRaw(owner);
  sqlite.failWrite = true;
  await assert.rejects(native.writeDraftState(owner, state(removeDraft(files, fileA))));
  assert.equal(nativeRaw(owner), before);
  assert.equal(sqlite.query('SELECT * FROM draft_cleanup').length, 0, 'cleanup enqueue rolls back with snapshot failure');
  assert.ok(fileUris(fileA).every(exists), 'failed write keeps all files');
  await native.writeDraftState(owner, state(removeDraft(files, fileA)));
  assert.ok(fileUris(fileA).every((uri) => !exists(uri)), 'discard deletes only the removed record files');
  assert.ok([...fileUris(fileB), ...fileUris(fileNew)].every(exists), 'other edit and new draft survive');
  sqlite.query('INSERT INTO draft_cleanup (owner_id, uri) VALUES (?, ?)', owner, fileB.pending_candidate.local_uri);
  await native.drainDraftCleanup(owner);
  assert.ok(exists(fileB.pending_candidate.local_uri), 'queued cleanup respects every current edit');
  sqlite.failWrite = true;
  await assert.rejects(native.clearDraftState(owner));
  assert.ok([...fileUris(fileB), ...fileUris(fileNew)].every(exists), 'failed clear keeps all files');
  filesystem.failDelete = true;
  await native.clearDraftState(owner);
  assert.ok(sqlite.query('SELECT * FROM draft_cleanup').length >= 6, 'failed deletion retains durable jobs');
  filesystem.failDelete = false;
  await native.drainDraftCleanup(owner);
  assert.ok([...fileUris(fileB), ...fileUris(fileNew)].every((uri) => !exists(uri)));
  assert.equal(sqlite.query('SELECT * FROM draft_cleanup').length, 0);

  const transientFile = { ...fileDraft('transient-file'), transient_edit: true };
  const retainedLegacyFile = fileDraft('retained-legacy-file');
  const retainedNewFile = { ...fileDraft('retained-new-file'), kind: 'new' };
  const transientFiles = { new: retainedNewFile, edits: { [transientFile.record_id]: transientFile, [retainedLegacyFile.record_id]: retainedLegacyFile } };
  const transientAttempt = { ...attempt(transientFile.selected_candidate, 'uncertain'), draft_id: transientFile.draft_id, record_id: transientFile.record_id };
  await native.writeDraftState(owner, state(transientFiles, transientAttempt));
  sqlite.query('INSERT INTO draft_cleanup (owner_id, uri) VALUES (?, ?)', owner, transientFile.photo.local_uri);
  await native.drainDraftCleanup(owner);
  assert.ok(fileUris(transientFile).every(exists), 'cleanup protects persisted transient save recovery files');
  const recoverySnapshot = nativeRaw(owner);
  sqlite.failWrite = true;
  await assert.rejects(native.writeDraftState(owner, state(transientFiles)));
  assert.equal(nativeRaw(owner), recoverySnapshot, 'failed filtered write preserves recovery snapshot');
  assert.ok(fileUris(transientFile).every(exists), 'failed filtered write preserves recovery files');
  await native.writeDraftState(owner, state(transientFiles));
  assert.ok(fileUris(transientFile).every((uri) => !exists(uri)), 'committed filter releases files from the previous recovery edit');
  assert.ok([...fileUris(retainedLegacyFile), ...fileUris(retainedNewFile)].every(exists), 'filter cleanup preserves old edit and new photo draft files');
  assert.deepEqual((await native.readDraftState(owner)).drafts, { new: retainedNewFile, edits: { [retainedLegacyFile.record_id]: retainedLegacyFile } });
  await native.clearDraftState(owner);

  const shared = makeFile('shared.png');
  const sharedDrafts = { new: null, edits: { a: { ...a, selected_candidate: image(shared) }, b: { ...b, pending_candidate: image(shared) } } };
  await native.writeDraftState(owner, state(sharedDrafts));
  await native.writeDraftState(owner, state(removeDraft(sharedDrafts, a)));
  assert.ok(exists(shared), 'a second edit retains a shared image');
  await native.writeDraftState(owner, state(empty(), attempt(image(shared))));
  assert.ok(exists(shared), 'an uncertain save retains its snapshot image');
  await native.writeDraftState(owner, state(empty(), attempt(image(shared), 'saved')));
  assert.equal(exists(shared), false, 'settled save releases its final reference');

  const legacyFile = fileDraft('legacy-file');
  seedNative(owner, state({ new: null, edit: legacyFile }));
  await native.writeDraftState(owner, state());
  assert.ok(fileUris(legacyFile).every((uri) => !exists(uri)), 'write cleanup reads the previous legacy snapshot');
  const oldA = fileDraft('old-a', 'OldDocuments');
  const oldB = fileDraft('old-b', 'OldDocuments');
  const oldNew = { ...fileDraft('old-new', 'OldDocuments'), kind: 'new' };
  const oldStamp = makeFile('old-save.png', owner, 'OldDocuments');
  seedNative(owner, state({ new: oldNew, edit: oldA, edits: { 'old-b': oldB } }, attempt(image(oldStamp))));
  const beforeRehomeMigration = nativeRaw(owner);
  sqlite.failWrite = true;
  const rehomed = await native.readDraftState(owner);
  const rehomedUris = [...listDrafts(rehomed.drafts).flatMap(fileUris), rehomed.save_attempt.payload_snapshot.stamp.local_uri];
  assert.equal(rehomedUris.length, 10);
  assert.ok(rehomedUris.every((uri) => uri.startsWith(pathToFileURL(join(root, 'Documents')).href) && exists(uri)), 'every image is copied into the current container');
  assert.equal(nativeRaw(owner), beforeRehomeMigration, 'failed rehome persistence preserves the original snapshot');
  assert.ok([...fileUris(oldA), ...fileUris(oldB), ...fileUris(oldNew), oldStamp].every(exists), 'failed rehome persistence preserves every original file');
  assert.deepEqual(await native.readDraftState(owner), rehomed, 'migration retries from the retained original snapshot');
  assert.deepEqual(JSON.parse(nativeRaw(owner)), rehomed, 'rehomed references are persisted');
  await native.clearDraftState(owner);
  assert.ok(rehomedUris.every((uri) => !exists(uri)), 'clear cleans all migrated edits and save snapshot');
  assert.ok(fileUris(oldA).every(exists), 'rehome copies preserve the original source files');

  const foreignFile = makeFile('foreign.png', 'owner-b');
  const protectedFile = makeFile('protected.png');
  seedNative(owner, state({ new: null, edits: { b: { ...b, owner_id: 'owner-b', photo: image(protectedFile) } } }));
  sqlite.query('INSERT INTO draft_cleanup (owner_id, uri) VALUES (?, ?)', owner, protectedFile);
  await native.drainDraftCleanup(owner);
  await assert.rejects(native.clearDraftState(owner));
  assert.ok(exists(protectedFile), 'foreign-owned snapshots cannot trigger cleanup');
  seedNative(owner, state());
  sqlite.query('INSERT INTO draft_cleanup (owner_id, uri) VALUES (?, ?)', owner, foreignFile);
  await native.drainDraftCleanup(owner);
  assert.ok(exists(foreignFile), 'cleanup cannot delete another account directory');
  await native.clearDraftState(owner);

  webRows.set(key(owner), JSON.stringify(state({ new: { ...n, stage: 'preparing' }, edit: a, edits: { b } }, attempt())));
  const legacyWeb = webRows.get(key(owner));
  failWebWrite = true;
  const recoveredWeb = await web.readDraftState(owner);
  const recoveredWebDrafts = { ...collection, new: { ...n, stage: 'interrupted', error_code: 'interrupted' } };
  assert.deepEqual(recoveredWeb.drafts, recoveredWebDrafts, 'failed web migration returns every recovered draft');
  assert.equal(recoveredWeb.save_attempt.state, 'uncertain');
  await assert.rejects(web.writeDraftState(owner, state(collection)));
  assert.equal(webRows.get(key(owner)), legacyWeb, 'storage failure preserves legacy recovery data');
  failWebWrite = false;
  await web.writeDraftState(owner, { ...recoveredWeb, drafts: putDraft(recoveredWeb.drafts, { ...b, fields: { ...fields, user_note: 'continued' } }) });
  assert.deepEqual(JSON.parse(webRows.get(key(owner))).drafts, { ...recoveredWebDrafts, edits: { a, b: { ...b, fields: { ...fields, user_note: 'continued' } } } }, 'the next web user edit preserves all restored drafts');
  webRows.set(key(owner), legacyWeb);
  assert.deepEqual((await web.readDraftState(owner)).drafts, recoveredWebDrafts, 'web migration retries on a later read');
  assert.deepEqual(JSON.parse(webRows.get(key(owner))).drafts, recoveredWebDrafts);
  console.log('draft-store.check passed: immutable helpers, real SQLite rollback, file lifetime, shared references, cleanup retry, rehome, storage failures');
} finally {
  hooks.deregister();
  if (savedStorage) Object.defineProperty(globalThis, 'sessionStorage', savedStorage);
  else delete globalThis.sessionStorage;
  rmSync(root, { recursive: true, force: true });
}
