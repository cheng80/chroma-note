import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as demo from '../demo-state.ts';
import * as app from '../app-state.ts';

const source = readFileSync(new URL('./useRecordCollection.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const record = { id: 'record-a', version: 1, fields: { is_favorite: false } };
let state = { ...demo.initialDemoState(), route: 'book', book_state: 'ready', records: [record],
  session: { owner_id: 'owner-a', generation: 1, source: 'supabase' } };
let index = 0, revision = 0, queue = Promise.resolve(), collection;
const slots = [], requests = [];
const memo = (create, deps) => {
  const i = index++;
  if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i].deps[j]))) slots[i] = { deps, value: create() };
  return slots[i].value;
};
const react = {
  useRef: value => memo(() => ({ current: value }), []),
  useCallback: (callback, deps) => memo(() => callback, deps),
  useState(initial) {
    const slot = memo(() => ({ value: initial }), []);
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  },
};
const store = {
  getState: () => state,
  isMounted: () => true,
  isCurrent: session => app.sameSession(state, session.owner_id, session.generation),
  apply: async next => { state = next; },
  enqueue: work => (queue = queue.then(work)),
  notice: () => assert.fail('unexpected notice'),
};
const latest = request => request.revision === revision && store.isCurrent(request.session);
const operations = {
  request: session => ({ session, revision: ++revision, signal: new AbortController().signal }),
  accepts: latest,
  isLatest: latest,
  reset: () => { revision++; },
  acquire: session => { revision++; return () => store.isCurrent(session); },
};
const mocks = {
  react, '../app-state': app, '../demo-state': demo,
  '../../services/records': {
    listRecords: (owner, filter, cursor) => new Promise((resolve, reject) => requests.push({ owner, cursor, resolve, reject })),
    setFavorite: async value => ({ ...value, version: value.version + 1, fields: { ...value.fields, is_favorite: !value.fields.is_favorite } }),
  },
  '../../services/record-cache': {
    readRecordDeletions: async () => [],
    readRecordCache: async () => state.records,
    cacheReadyRecords: async () => {},
    pruneCachedRecords: async () => {},
  },
};
const module = { exports: {} };
new Function('require', 'module', 'exports', output)(id => { assert.ok(id in mocks, `missing mock: ${id}`); return mocks[id]; }, module, module.exports);
const rejectSession = async () => false;
function render() { index = 0; collection = module.exports.useRecordCollection(store, operations, rejectSession); }
async function flush() { await tick(); await queue; render(); }
function flags(refreshing, pullRefreshing, message) {
  render();
  assert.deepEqual([collection.refreshing, collection.pullRefreshing], [refreshing, pullRefreshing], message);
}
async function start(run, pull = false) {
  const records = state.records, bookState = state.book_state, count = requests.length;
  run();
  flags(true, pull, 'request starts with the correct spinner');
  await flush();
  assert.equal(requests.length, count + 1, 'must actually reach listRecords');
  assert.strictEqual(state.records, records, 'pending refresh preserves the displayed list');
  assert.equal(state.book_state, bookState, 'pending refresh preserves the displayed book state');
  flags(true, pull, 'spinner stays correct while listRecords is pending');
  return requests.at(-1);
}
async function finish(request, records = state.records) {
  request.resolve({ records, cursor: 'next-page' });
  await flush();
  flags(false, false, 'current request completion clears both flags');
}

render();
flags(false, false, 'initial flags');
for (const run of [() => collection.refresh(), () => collection.sessionChanged(true),
  () => collection.handle({ type: 'retry-image' }), () => collection.handle({ type: 'load-more' })]) {
  const request = await start(run);
  await finish(request);
}
assert.equal(requests.at(-1).cursor, 'next-page', 'load-more requests the next page');
await finish(await start(() => collection.handle({ type: 'retry-book' }), true));

const beforeFavorite = requests.length;
assert.equal(await collection.handle({ type: 'toggle-favorite', recordId: record.id }), true);
await flush();
assert.equal(state.records[0].fields.is_favorite, true, 'favorite mutation reaches the list');
assert.equal(requests.length, beforeFavorite + 1, 'favorite completion refreshes the collection');
const favoriteRecords = state.records;
flags(true, false, 'favorite post-refresh must not activate RefreshControl');
await flush();
assert.strictEqual(state.records, favoriteRecords, 'post-refresh preserves the updated list while pending');
await finish(requests.at(-1));

for (const failOld of [false, true]) {
  const old = await start(() => collection.refresh());
  const current = await start(() => collection.handle({ type: 'retry-book' }), true);
  const records = state.records;
  if (failOld) old.reject(new Error('late background failure'));
  else old.resolve({ records: [], cursor: null });
  await flush();
  flags(true, true, 'superseded request cleanup must preserve the newer pull spinner');
  assert.strictEqual(state.records, records, 'superseded response must not replace the list');
  await finish(current);
}

const failed = await start(() => collection.handle({ type: 'retry-book' }), true);
failed.reject(new Error('offline'));
await flush();
flags(false, false, 'current request failure also clears both flags');
assert.equal(state.records[0].fields.is_favorite, true);
const pending = await start(() => collection.handle({ type: 'retry-book' }), true);
state = { ...state, session: null, records: [] };
collection.sessionChanged(false);
flags(false, false, 'session reset clears pending spinner');
assert.equal(collection.hasMore, false);
pending.resolve({ records: [record], cursor: 'stale' });
await flush();
flags(false, false, 'late response after reset cannot restore flags');
assert.deepEqual(state.records, [], 'late response cannot restore the previous session list');
console.log('useRecordCollection.check passed: background, session refresh, favorite, pull, pagination, request cleanup, list preservation, session reset');
