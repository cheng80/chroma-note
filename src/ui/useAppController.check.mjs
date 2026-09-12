import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import React from 'react';
import { getBasicCopy } from './basic-copy.ts';
import { demoReducer, initialDemoState } from './demo-state.ts';
import * as recordWriting from './record-writing.ts';

const appSource = readFileSync(new URL('./AppDemo.tsx', import.meta.url), 'utf8');
if (!appSource.includes("sessionRestoreStatus !== 'complete'")) throw new Error('auth entry must stay locked until session restore completes');
if (!appSource.includes('onStartSessionReauthentication')) throw new Error('the restore failure screen must expose email reauthentication');
const emailSource = readFileSync(new URL('./screens/EmailScreen.tsx', import.meta.url), 'utf8');
if (!emailSource.includes('이메일로 다시 인증')) throw new Error('the restore failure screen must offer an email reauthentication action');
if (!appSource.includes('key={fontScale}')) throw new Error('font scale changes must remount the rendered UI for measurement');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function savingState(kind = 'new') {
  let state = initialDemoState();
  state = demoReducer(state, { type: 'email', value: 'demo@example.com' });
  state = demoReducer(state, { type: 'submit-email' });
  state = demoReducer(state, { type: 'code', value: '123456' });
  state = demoReducer(state, { type: 'verify' });
  state = demoReducer(state, { type: 'start-record' });
  state = demoReducer(state, { type: 'use-photo' });
  state = demoReducer(state, { type: 'continue-photo' });
  while (state.active_job) state = demoReducer(state, { type: 'tick-processing', jobId: state.active_job.job_id, inputRevision: state.active_job.input_revision });
  state = demoReducer(state, { type: 'confirm', value: true });
  state = demoReducer(state, { type: 'continue-compare' });
  state = demoReducer(state, { type: 'save' });
  if (kind === 'edit') {
    const operationId = state.save_attempt.operation_id;
    state = demoReducer(state, { type: 'save-result', operationId, outcome: 'success' });
    const recordId = state.records[0].id;
    state = demoReducer(state, { type: 'open-detail', recordId });
    state = demoReducer(state, { type: 'edit-record' });
    state = demoReducer(state, { type: 'save' });
  }
  const operationId = state.save_attempt.operation_id;
  state = demoReducer(state, { type: 'save-result', operationId, outcome: 'uncertain' });
  return demoReducer(state, { type: 'request-discard-save' });
}

// Resolve from the importing file so extracted workflows share the same service overrides.
function resolveLocalModule(id, importer) {
  const base = resolve(dirname(importer), id);
  const filename = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
    .find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());
  assert.ok(filename, `Cannot resolve ${id} from ${importer}`);
  return realpathSync(filename);
}

function controllerHarness(initialState, records = {}, restore = {}, cache = {}, alerts = []) {
  const stateSlots = [];
  const stateSetters = [];
  const refSlots = [];
  const effects = [];
  const memoSlots = [];
  let stateIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let effectIndex = 0;
  let unmounted = false;
  let updatesAfterUnmount = 0;
  const sameDeps = (before, after) => before !== undefined && after !== undefined
    && before.length === after.length && after.every((value, index) => Object.is(value, before[index]));
  function registerEffect(kind, effect, deps) {
    const index = effectIndex++;
    const slot = effects[index] ?? { hasRun: false };
    slot.kind = kind;
    slot.effect = effect;
    slot.deps = deps;
    slot.pending = !slot.hasRun || !sameDeps(slot.committedDeps, deps);
    effects[index] = slot;
  }
  function flushEffects(kind) {
    const pending = effects.filter(slot => slot.kind === kind && slot.pending);
    // Clean up changed effects before running replacements in the same phase.
    for (const slot of pending) slot.cleanup?.();
    for (const slot of pending) {
      slot.pending = false;
      slot.hasRun = true;
      slot.committedDeps = slot.deps;
      slot.cleanup = slot.effect();
    }
  }
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in stateSlots)) {
        stateSlots[index] = typeof initial === 'function' ? initial() : initial;
        stateSetters[index] = (value) => {
          if (unmounted) { updatesAfterUnmount += 1; return; }
          stateSlots[index] = typeof value === 'function' ? value(stateSlots[index]) : value;
        };
      }
      return [stateSlots[index], stateSetters[index]];
    },
    useRef(initial) {
      const index = refIndex++;
      if (!(index in refSlots)) refSlots[index] = { current: initial };
      return refSlots[index];
    },
    useMemo(factory, deps) {
      const index = memoIndex++;
      const previous = memoSlots[index];
      if (!previous || !sameDeps(previous.deps, deps)) {
        memoSlots[index] = { value: factory(), deps };
      }
      return memoSlots[index].value;
    },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
    useEffect: (effect, deps) => registerEffect('passive', effect, deps),
    useLayoutEffect: (effect, deps) => registerEffect('layout', effect, deps),
  };
  const noOp = async () => undefined;
  const mocks = {
    react,
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, AppState: { currentState: 'active', addEventListener: restore.addEventListener ?? (() => ({ remove() {} })) } },
    'expo-crypto': { randomUUID: () => 'operation-check' },
    'expo-localization': { getLocales: () => [{ languageTag: 'ko-KR' }] },
    '../services/supabase': { getSupabase: () => restore.client ?? (() => { throw new Error('unused'); })(), startSessionRefresh: restore.startSessionRefresh ?? (() => () => undefined) },
    '../services/secure-session': { secureSessionStorage: { getItem: async () => null, setItem: noOp } },
    '../services/auth': { sendEmailOtp: restore.sendEmailOtp ?? noOp, verifyEmailOtp: noOp, signOut: async () => ({ error: null }), authErrorCode: () => 'unknown' },
    '../services/draft-store': { clearDraftState: restore.clearDraftState ?? noOp, drainDraftCleanup: noOp, readDraftState: restore.readDraftState ?? (async () => null), writeDraftState: restore.writeDraftState ?? noOp },
    '../services/records': {
      abortSave: records.abortSave ?? noOp,
      fetchRecord: records.fetchRecord ?? (async () => null),
      saveRecord: records.saveRecord ?? (async () => { throw new Error('unexpected save'); }),
      deleteRecord: records.deleteRecord ?? noOp,
      listRecords: records.listRecords ?? (async () => new Promise(() => undefined)),
      setFavorite: noOp,
    },
    '../services/record-cache': {
      cacheReadyRecords: cache.cacheReadyRecords ?? noOp, clearRecordCache: cache.clearRecordCache ?? noOp, pruneCachedRecords: noOp, queueRecordDeletion: cache.queueRecordDeletion ?? noOp,
      readRecordCache: async () => [], readRecordDeletions: cache.readRecordDeletions ?? (async () => []), removeCachedRecord: cache.removeCachedRecord ?? noOp, removeRecordDeletion: cache.removeRecordDeletion ?? noOp,
    },
    '../services/photo-input': { photoInputFailure: () => ({ message: { ko: '', en: '' } }), pickPhoto: async () => null, removeWorkingPhoto: restore.removeWorkingPhoto ?? (() => undefined) },
    './demo-assets': { demoAssets: {}, demoImages: {} },
    '../services/photo-processing': { processPhotoStep: noOp },
    '../../modules/chroma-analysis': { generatePhotoNote: noOp, preparePhotoAnalysis: noOp, unloadPhotoAnalysis: async () => false },
  };
  const entry = fileURLToPath(new URL('./useAppController.ts', import.meta.url));
  const overrides = new Map(Object.entries(mocks).map(([id, value]) => [id.startsWith('.') ? resolveLocalModule(id, entry) : id, value]));
  const modules = new Map();
  function load(id, importer = entry) {
    const filename = id.startsWith('.') ? resolveLocalModule(id, importer) : id;
    if (overrides.has(filename)) return overrides.get(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    assert.ok(id.startsWith('.'), `Missing controller check mock: ${id} from ${importer}`);
    const module = { exports: {} };
    modules.set(filename, module);
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', 'process', output)(dependency => load(dependency, filename), module, module.exports, process);
    return module.exports;
  }
  // Seed the first controller mount; later sign-out/reset calls use the real domain initializer.
  const demoState = load('./demo-state');
  const initialize = demoState.initialDemoState;
  demoState.initialDemoState = () => {
    demoState.initialDemoState = initialize;
    return initialState;
  };
  const controllerModule = load('./useAppController');
  return {
    render() {
      assert.ok(!unmounted, 'Cannot render an unmounted controller');
      stateIndex = 0;
      refIndex = 0;
      memoIndex = 0;
      effectIndex = 0;
      const controller = controllerModule.useAppController();
      flushEffects('layout');
      return controller;
    },
    runEffects() {
      assert.ok(!unmounted, 'Cannot run effects after unmount');
      flushEffects('passive');
    },
    unmount() {
      if (unmounted) return;
      unmounted = true;
      for (const kind of ['layout', 'passive']) {
        for (const slot of effects.filter(slot => slot.kind === kind)) {
          slot.cleanup?.();
          slot.cleanup = undefined;
          slot.pending = false;
        }
      }
    },
    get updatesAfterUnmount() { return updatesAfterUnmount; },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

{
  const availableAt = Date.now() + 73_000;
  let requests = 0;
  const harness = controllerHarness(initialDemoState(), {}, {
    sendEmailOtp: async () => { requests += 1; return { data: { resendAvailableAt: availableAt }, error: null }; },
  });
  let controller = harness.render();
  controller.send({ type: 'email', value: 'qa@example.com' });
  controller.send({ type: 'submit-email' });
  await settle();
  controller = harness.render();
  assert.equal(controller.state.route, 'otp');
  assert.equal(controller.state.auth.resend_available_at, availableAt, 'the auth service owns the resend deadline');
  controller.send({ type: 'resend' });
  await settle();
  assert.equal(requests, 1, 'the UI respects the returned deadline');
}

{
  const restored = deferred();
  const page = deferred();
  const calls = { getSession: 0, list: 0, subscribe: 0, unsubscribe: 0, startRefresh: 0, stopRefresh: 0, drafts: 0, cache: 0 };
  const nativeSubscriptions = [];
  const alerts = [];
  let authListener;
  const harness = controllerHarness(initialDemoState(), {
    listRecords: () => { calls.list += 1; return page.promise; },
  }, {
    client: { auth: {
      getSession: () => { calls.getSession += 1; return restored.promise; },
      onAuthStateChange: callback => {
        calls.subscribe += 1;
        authListener = callback;
        return { data: { subscription: { unsubscribe() { calls.unsubscribe += 1; } } } };
      },
    } },
    startSessionRefresh: () => { calls.startRefresh += 1; return () => { calls.stopRefresh += 1; }; },
    addEventListener: event => {
      const subscription = { event, removals: 0, remove() { this.removals += 1; } };
      nativeSubscriptions.push(subscription);
      return subscription;
    },
    readDraftState: async () => { calls.drafts += 1; return null; },
  }, { cacheReadyRecords: async () => { calls.cache += 1; } }, alerts);
  let controller = harness.render();
  harness.runEffects();
  authListener('SIGNED_IN', { user: { id: 'owner-a', email: 'a@example.com' }, access_token: 'token-a' });
  await settle();
  await settle();
  const subscribedEvents = nativeSubscriptions.map(item => item.event);
  assert.ok(subscribedEvents.includes('change'), 'the root must subscribe to app lifecycle changes');
  assert.ok(subscribedEvents.includes('memoryWarning'), 'the photo workflow must subscribe to memory warnings');
  for (let render = 0; render < 3; render += 1) {
    controller = harness.render();
    harness.runEffects();
    await settle();
    await settle();
    assert.equal(controller.state.session?.owner_id, 'owner-a', 'authenticated rerenders must retain the active owner');
    assert.equal(controller.sessionRestoreStatus, 'complete', 'authenticated rerenders must not restart reauthentication');
    assert.deepEqual(calls, { getSession: 1, list: 1, subscribe: 1, unsubscribe: 0, startRefresh: 1, stopRefresh: 0, drafts: 1, cache: 0 }, 'rerenders must not restart session, list, or subscription effects');
    assert.deepEqual(nativeSubscriptions.map(item => item.event), subscribedEvents, 'rerenders must retain root and photo subscriptions');
    assert.ok(nativeSubscriptions.every(item => item.removals === 0), 'stable effects must not run cleanup on rerender');
  }
  // Make a restore current again so unmount, rather than SIGNED_IN, must invalidate it.
  controller.retrySessionRestore();
  assert.equal(calls.getSession, 2, 'an explicit retry must start one new restore');
  harness.unmount();
  assert.equal(calls.unsubscribe, 1, 'unmount must remove the auth subscription once');
  assert.equal(calls.stopRefresh, 1, 'unmount must stop session refresh once');
  assert.ok(nativeSubscriptions.every(item => item.removals === 1), 'unmount must remove every root and photo subscription once');
  const afterUnmount = { ...calls };
  restored.resolve({ data: { session: { user: { id: 'owner-b', email: 'b@example.com' }, access_token: 'token-b' } }, error: null });
  page.resolve({ records: savingState('edit').records, cursor: null });
  await settle();
  await settle();
  assert.deepEqual(calls, afterUnmount, 'late restore and list results must not restore drafts, cache records, or restart effects after unmount');
  assert.equal(harness.updatesAfterUnmount, 0, 'late results must not attempt to publish controller state after unmount');
  assert.deepEqual(alerts, [], 'late results must not display notices after unmount');
  console.log('useAppController.check passed: authenticated rerenders retain effects and unmount blocks late restore/list results');
}

{
  const abort = deferred();
  let saveCalls = 0;
  const harness = controllerHarness(savingState(), { abortSave: () => abort.promise, saveRecord: async () => { saveCalls += 1; } });
  let controller = harness.render();
  controller.send({ type: 'discard-save-confirm' });
  await settle();
  controller.send({ type: 'retry-save' });
  controller.send({ type: 'summary-back' });
  await settle();
  controller = harness.render();
  assert.equal(controller.state.route, 'summary', 'navigation must not change state while discard resolution owns the controller');
  assert.equal(controller.state.save_attempt.state, 'uncertain', 'the same operation must not return to pending while abort is unresolved');
  assert.equal(saveCalls, 0, 'retry must not re-save the operation while abort is unresolved');
  abort.resolve();
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.drafts.new, null, 'successful abort must finish local discard');
}

{
  const initial = savingState();
  const ready = { source: 'supabase', id: initial.save_attempt.record_id, user_id: initial.session.owner_id, status: 'ready', version: 1, stamp: { ...initial.drafts.new.selected_candidate, source: 'supabase' }, color_tags: [], fields: initial.drafts.new.fields, created_at: new Date(0).toISOString() };
  const lookup = deferred();
  let saveCalls = 0;
  const harness = controllerHarness(initial, {
    abortSave: async () => { throw Object.assign(new Error('already ready'), { code: 'conflict' }); },
    fetchRecord: () => lookup.promise,
    saveRecord: async () => { saveCalls += 1; throw new Error('discard must not finalize'); },
  });
  let controller = harness.render();
  controller.send({ type: 'discard-save-confirm' });
  await settle();
  controller.send({ type: 'retry-save' });
  controller.send({ type: 'summary-back' });
  await settle();
  controller = harness.render();
  assert.equal(controller.state.route, 'summary', 'actions must stay locked while an abort conflict is checked');
  assert.equal(controller.state.save_attempt.operation_id, initial.save_attempt.operation_id, 'the checked operation must stay unchanged');
  lookup.resolve(ready);
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(saveCalls, 0, 'abort conflict must use a read-only ready check');
  assert.equal(controller.state.records[0]?.id, ready.id, 'a ready record found after abort conflict must refresh the visible server record');
  assert.equal(controller.state.drafts.new?.draft_id, initial.drafts.new.draft_id, 'an unverified ready operation must preserve the local draft');
  assert.equal(controller.state.save_attempt.operation_id, initial.save_attempt.operation_id, 'an unverified ready operation must preserve the retry identity');
}

{
  const initial = savingState('edit');
  const refreshed = { ...initial.records[0], version: initial.records[0].version + 1, fields: { ...initial.records[0].fields, user_note: '서버 최신 메모' } };
  const harness = controllerHarness(initial, { fetchRecord: async () => refreshed });
  let controller = harness.render();
  controller.send({ type: 'discard-save-confirm' });
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.drafts.edit, null, 'uncertain edit discard must remove only the local edit draft');
  assert.equal(controller.state.records.find((record) => record.id === refreshed.id)?.version, refreshed.version, 'uncertain edit discard must refresh the existing record');
}

{
  const conflicted = savingState('edit');
  const record = conflicted.records[0];
  const localNote = '내가 수정한 메모';
  const initial = {
    ...conflicted,
    save_attempt: { ...conflicted.save_attempt, state: 'conflict' },
    drafts: { ...conflicted.drafts, edit: { ...conflicted.drafts.edit, fields: { ...conflicted.drafts.edit.fields, user_note: localNote } } },
  };
  const latestRecord = { ...record, version: record.version + 1, stamp: { ...record.stamp, local_uri: 'https://example.test/latest.png' }, fields: { ...record.fields, user_note: '서버 최신 메모' } };
  const alerts = [];
  let savedAttempt;
  const harness = controllerHarness(initial, {
    fetchRecord: async () => latestRecord,
    saveRecord: async (attempt) => {
      savedAttempt = attempt;
      return { ...latestRecord, version: latestRecord.version + 1, fields: attempt.payload_snapshot.fields };
    },
  }, {}, {}, alerts);
  let controller = harness.render();
  controller.send({ type: 'retry-save' });
  await settle();
  await settle();
  assert.equal(alerts.length, 1, 'an edit conflict must show the latest record before rebasing local edits');
  alerts[0][2][1].onPress();
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.records[0].fields.user_note, latestRecord.fields.user_note, 'the visible record must use the latest server values');
  assert.equal(controller.state.drafts.edit.fields.user_note, localNote, 'the local edit must survive conflict review');
  assert.equal(controller.state.drafts.edit.base_record_version, latestRecord.version, 'the preserved edit must rebase on the latest server version');
  assert.equal(controller.state.drafts.edit.selected_candidate.local_uri, latestRecord.stamp.local_uri, 'immutable record data must refresh with the latest server record');
  assert.equal(controller.state.save_attempt, null, 'the conflicting operation must be cleared before creating a reviewed retry');
  controller.send({ type: 'save' });
  await settle();
  await settle();
  await settle();
  assert.equal(savedAttempt.base_version, latestRecord.version, 'the reviewed retry must use the latest CAS version');
  assert.equal(savedAttempt.payload_snapshot.fields.user_note, localNote, 'the reviewed retry must submit the preserved local edit');
}

{
  const editing = savingState('edit');
  const record = editing.records[0];
  const detail = { ...editing, route: 'detail', active_draft_kind: null, drafts: { new: null, edit: null }, save_attempt: null, selected_record_id: record.id };
  const restarted = { ...detail, route: 'book', selected_record_id: null };
  const queued = [];
  let deleteCalls = 0;
  let cacheCleanupCalls = 0;
  const cache = {
    queueRecordDeletion: async (ownerId, recordId, baseVersion) => {
      queued.push({ owner_id: ownerId, record_id: recordId, base_version: baseVersion, requested_at: 1 });
    },
    readRecordDeletions: async () => [...queued],
    removeCachedRecord: async () => { cacheCleanupCalls += 1; },
    removeRecordDeletion: async (_ownerId, recordId) => {
      const index = queued.findIndex((item) => item.record_id === recordId);
      if (index >= 0) queued.splice(index, 1);
    },
  };
  const records = {
    deleteRecord: async () => {
      deleteCalls += 1;
      if (deleteCalls < 3) throw Object.assign(new Error(deleteCalls === 1 ? 'offline' : 'server object cleanup incomplete'), { code: 'network' });
    },
    listRecords: async () => ({ records: [record], cursor: null }),
  };
  let harness = controllerHarness(detail, records, {}, cache);
  let controller = harness.render();
  controller.send({ type: 'delete-confirm' });
  await settle();
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(deleteCalls, 2, 'a confirmed deletion must retry its persisted intent after the first remote failure');
  assert.equal(queued.length, 1, 'the delete intent must be persisted before an offline remote failure');
  assert.deepEqual(controller.pendingDeletions, [record.id], 'the UI must keep reporting deletion while cleanup is incomplete');
  assert.equal(cacheCleanupCalls, 0, 'local state must remain until server object cleanup is confirmed');
  assert.equal(queued.length, 1, 'a server object cleanup failure must keep the delete intent for another restart');

  harness = controllerHarness(restarted, records, {}, cache);
  controller = harness.render();
  controller.send({ type: 'retry-book' });
  await settle();
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(deleteCalls, 3, 'the next controller start must retry server object cleanup again');
  assert.equal(cacheCleanupCalls, 1, 'local cache cleanup must run only after server deletion succeeds');
  assert.equal(queued.length, 0, 'the delete intent must clear only after local cleanup succeeds');
  assert.deepEqual(controller.pendingDeletions, [], 'the UI must clear deletion progress after full cleanup');
}

{
  const persisted = savingState();
  const ownerA = persisted.session.owner_id;
  const restore = deferred();
  let authListener;
  let clearDraftCalls = 0;
  const harness = controllerHarness(initialDemoState(), {}, {
    client: {
      auth: {
        getSession: () => restore.promise,
        onAuthStateChange: (callback) => {
          authListener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        startAutoRefresh() {},
        stopAutoRefresh() {},
      },
    },
    clearDraftState: async () => { clearDraftCalls += 1; },
    readDraftState: async (ownerId) => ownerId === ownerA
      ? { drafts: persisted.drafts, save_attempt: persisted.save_attempt }
      : null,
  });
  let controller = harness.render();
  harness.runEffects();
  restore.resolve({ data: { session: null }, error: new Error('refresh rejected') });
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.sessionRestoreStatus, 'failed', 'a rejected session restore must lock the session UI');
  assert.equal(clearDraftCalls, 0, 'a rejected session restore must not clear persisted drafts');
  authListener('INITIAL_SESSION', null);
  await settle();
  controller = harness.render();
  assert.equal(controller.sessionRestoreStatus, 'failed', 'an initial auth notification must not unlock a failed restore');

  controller.beginSessionReauthentication();
  controller = harness.render();
  assert.equal(controller.sessionRestoreStatus, 'complete', 'reauthentication must unlock only the email entry UI');
  authListener('SIGNED_IN', { user: { id: ownerA, email: 'a@example.com' }, access_token: 'token-a' });
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session?.owner_id, ownerA, 'the reauthenticated owner must become the active session');
  assert.equal(controller.state.drafts.new?.draft_id, persisted.drafts.new?.draft_id, 'the reauthenticated owner must recover its persisted draft');

  authListener('SIGNED_OUT', null);
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.sessionRestoreStatus, 'failed', 'a server-rejected session must return to the locked reauthentication screen');
  assert.equal(clearDraftCalls, 0, 'a server-rejected session must not clear persisted drafts');

  controller.beginSessionReauthentication();
  authListener('SIGNED_IN', { user: { id: 'owner-b', email: 'b@example.com' }, access_token: 'token-b' });
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session?.owner_id, 'owner-b', 'a different authenticated owner must replace the locked session');
  assert.equal(controller.state.drafts.new, null, 'a different authenticated owner must not receive the previous owner draft');
}

{
  const persisted = savingState();
  let clearDraftCalls = 0;
  const harness = controllerHarness(persisted, {
    saveRecord: async () => { throw Object.assign(new Error('refresh rejected'), { code: 'unauthorized' }); },
  }, {
    clearDraftState: async () => { clearDraftCalls += 1; },
  });
  let controller = harness.render();
  controller.send({ type: 'retry-save' });
  await settle();
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.sessionRestoreStatus, 'failed', 'a 401 refresh failure during save must lock the session UI');
  assert.equal(controller.state.session, null, 'a rejected save session must not leave the previous account active');
  assert.equal(clearDraftCalls, 0, 'a rejected save session must not clear persisted drafts');
}

{
  const rejectedSave = deferred();
  const restore = deferred();
  let authListener;
  const initial = savingState();
  const ownerA = initial.session.owner_id;
  const harness = controllerHarness(initial, {
    saveRecord: () => rejectedSave.promise,
  }, {
    client: {
      auth: {
        getSession: () => restore.promise,
        onAuthStateChange: (callback) => {
          authListener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        startAutoRefresh() {},
        stopAutoRefresh() {},
      },
    },
  });
  let controller = harness.render();
  harness.runEffects();
  controller.send({ type: 'retry-save' });
  await settle();
  authListener('SIGNED_IN', { user: { id: 'owner-b', email: 'b@example.com' }, access_token: 'token-b' });
  await settle();
  await settle();
  rejectedSave.reject(Object.assign(new Error('A refresh rejected'), { code: 'unauthorized' }));
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(ownerA === controller.state.session?.owner_id, false, 'the later owner must replace A before its save completes');
  assert.equal(controller.state.session?.owner_id, 'owner-b', 'a stale A save rejection must not clear B');
  assert.equal(controller.sessionRestoreStatus, 'complete', 'a stale A save rejection must not relock B');
}

{
  const restore = deferred();
  const listRequests = [];
  let authListener;
  const harness = controllerHarness(initialDemoState(), {
    listRecords: () => {
      const request = deferred();
      listRequests.push(request);
      return request.promise;
    },
  }, {
    client: {
      auth: {
        getSession: () => restore.promise,
        onAuthStateChange: (callback) => {
          authListener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        startAutoRefresh() {},
        stopAutoRefresh() {},
      },
    },
  });
  let controller = harness.render();
  harness.runEffects();
  authListener('SIGNED_IN', { user: { id: 'owner-a', email: 'a@example.com' }, access_token: 'token-a' });
  await settle();
  await settle();
  assert.equal(listRequests.length, 1, 'owner A refresh must be in flight before switching accounts');
  restore.resolve({ data: { session: null }, error: null });
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session?.owner_id, 'owner-a', 'a stale startup restore must not replace the later authenticated owner');
  authListener('TOKEN_REFRESHED', { user: { id: 'owner-a', email: 'a@example.com' }, access_token: 'token-a-new' });
  await settle();
  await settle();
  assert.equal(listRequests.length, 1, 'token refresh must not restart the query that requested it');
  controller = harness.render();
  assert.equal(controller.sessionRestoreStatus, 'complete', 'same-owner token refresh must keep the UI unlocked');
  authListener('SIGNED_IN', { user: { id: 'owner-b', email: 'b@example.com' }, access_token: 'token-b' });
  await settle();
  await settle();
  listRequests[0].reject(Object.assign(new Error('A refresh rejected'), { code: 'unauthorized' }));
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session?.owner_id, 'owner-b', 'a stale A list rejection must not clear B');
  assert.equal(controller.sessionRestoreStatus, 'complete', 'a stale A list rejection must not relock B');
  authListener('TOKEN_REFRESHED', { user: { id: 'owner-b', email: 'b@example.com' }, access_token: 'token-b-new' });
  await settle();
  await settle();
  assert.equal(listRequests.length, 2, 'B token refresh must retain its current query');
  listRequests[1].reject(Object.assign(new Error('B still unauthorized after refresh'), { code: 'unauthorized' }));
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session, null, 'a current query rejection must clear the session after token refresh');
  assert.equal(controller.sessionRestoreStatus, 'failed', 'a repeated 401 must reach reauthentication instead of restarting queries');
}

console.log('useAppController.check passed: rejected sessions require reauthentication and restore only the authenticated owner draft');
console.log('useAppController.check passed: discard resolution is serialized, abort conflict preserves unverified operations, and uncertain edits refresh');
console.log('useAppController.check passed: edit conflicts preserve both versions and deletion cleanup resumes after restart');

// All four fetchRecord callers receive the service's final classified error after its refresh retry.
for (const path of ['detail', 'save-conflict', 'abort-conflict', 'discard-edit']) {
  for (const outcome of ['unauthorized', 'network', 'late-owner', 'pending-owner', 'late-generation']) {
    const saving = savingState(path === 'abort-conflict' ? 'new' : 'edit');
    const initial = path === 'detail' ? { ...saving, route: 'book', dialog: null }
      : path === 'save-conflict' ? { ...saving, save_attempt: { ...saving.save_attempt, state: 'conflict' } } : saving;
    const owner = initial.session.owner_id;
    const session = { user: { id: owner, email: 'a@example.com' }, access_token: 'token-a' };
    let persisted = { drafts: initial.drafts, save_attempt: initial.save_attempt };
    const preserved = structuredClone(persisted);
    const lookup = deferred();
    const nextOwnerDrafts = deferred();
    const alerts = [];
    let authListener;
    let fetchCalls = 0;
    let listCalls = 0;
    let cleanupCalls = 0;
    const cleanup = () => { cleanupCalls += 1; };
    const harness = controllerHarness(initial, {
      abortSave: async () => { throw Object.assign(new Error('already ready'), { code: 'conflict' }); },
      fetchRecord: () => { fetchCalls += 1; return lookup.promise; },
      listRecords: () => { listCalls += 1; return new Promise(() => {}); },
    }, {
      client: { auth: {
        getSession: () => new Promise(() => {}),
        onAuthStateChange: callback => { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      } },
      readDraftState: async ownerId => ownerId === owner ? persisted : outcome === 'pending-owner' ? nextOwnerDrafts.promise : null,
      writeDraftState: async (ownerId, value) => { assert.equal(ownerId, owner); persisted = value; },
      clearDraftState: cleanup,
      removeWorkingPhoto: cleanup,
    }, { clearRecordCache: cleanup, removeCachedRecord: cleanup }, alerts);
    let controller = harness.render();
    harness.runEffects();
    authListener('TOKEN_REFRESHED', session);
    await settle();
    controller.send(path === 'detail' ? { type: 'open-detail', recordId: initial.records[0].id }
      : { type: path === 'save-conflict' ? 'retry-save' : 'discard-save-confirm' });
    await settle();
    assert.equal(fetchCalls, 1, `${path}: the intended fetchRecord caller must be exercised`);
    if (outcome === 'late-owner' || outcome === 'pending-owner') {
      authListener('SIGNED_IN', { user: { id: 'owner-b', email: 'b@example.com' }, access_token: 'token-b' });
      await settle();
      if (outcome === 'pending-owner') {
        assert.equal(harness.render().sessionRestoreStatus, 'restoring', `${path}: the UI must stay locked while the next owner drafts load`);
      }
    } else if (outcome === 'late-generation') {
      authListener('SIGNED_OUT', null);
      await settle();
      authListener('SIGNED_IN', session);
      await settle();
    }
    const listsBeforeRejection = listCalls;
    lookup.reject(Object.assign(new Error(outcome), { code: outcome === 'network' ? 'network' : 'unauthorized' }));
    await settle();
    if (outcome === 'pending-owner') nextOwnerDrafts.resolve(null);
    await settle();
    controller = harness.render();
    if (outcome === 'unauthorized') {
      assert.equal(controller.state.session, null, `${path}: final 401 must clear the visible session`);
      assert.equal(controller.sessionRestoreStatus, 'failed', `${path}: final 401 must require reauthentication`);
      assert.equal(alerts.length, 0, `${path}: final 401 must not show the cache or generic failure notice`);
      assert.equal(listCalls, listsBeforeRejection, `${path}: rejected auth must not launch another list refresh`);
      controller.beginSessionReauthentication();
      authListener('SIGNED_IN', session);
      await settle();
      controller = harness.render();
      assert.deepEqual(controller.state.drafts, preserved.drafts, `${path}: reauthentication must recover every original draft`);
      assert.deepEqual(controller.state.save_attempt, preserved.save_attempt, `${path}: reauthentication must preserve the save identity`);
    } else {
      assert.equal(controller.state.session?.owner_id, ['late-owner', 'pending-owner'].includes(outcome) ? 'owner-b' : owner, `${path}: non-current auth errors must not clear the active owner`);
      assert.equal(controller.sessionRestoreStatus, 'complete', `${path}: offline or stale responses must not lock the UI`);
      assert.equal(alerts.length, outcome === 'network' ? 1 : 0, `${path}: only the current offline request may show a fallback notice`);
      if (outcome === 'network') {
        assert.deepEqual(controller.state.drafts, preserved.drafts, `${path}: offline failure must preserve drafts`);
        assert.deepEqual(controller.state.save_attempt, preserved.save_attempt, `${path}: offline failure must preserve the pending operation`);
        if (path === 'detail') {
          assert.equal(controller.state.route, 'detail', 'offline detail must remain open');
          assert.equal(controller.record.id, initial.records[0].id, 'offline detail must retain its cached record');
          assert.deepEqual(controller.record.fields, initial.records[0].fields, 'offline detail must preserve cached contents');
          assert.match(alerts[0][1], /기기에 보관한 내용을 표시|Showing the copy kept on this device/);
        }
      }
    }
    assert.deepEqual(persisted, preserved, `${path}/${outcome}: auth failures must not alter persisted drafts or save snapshots`);
    assert.equal(cleanupCalls, 0, `${path}/${outcome}: auth failures must never delete draft files or cache`);
  }
}

for (const supersededBy of ['refresh', 'another-detail', 'back-book', 'mutation']) {
  const saved = savingState('edit');
  const other = { ...saved.records[0], id: 'other-record' };
  const initial = { ...saved, route: 'book', dialog: null, records: [...saved.records, other] };
  const lookup = deferred();
  const alerts = [];
  const harness = controllerHarness(initial, {
    fetchRecord: (_owner, id) => id === other.id ? new Promise(() => {}) : lookup.promise,
    deleteRecord: () => new Promise(() => {}),
  }, {}, {}, alerts);
  let controller = harness.render();
  controller.send({ type: 'open-detail', recordId: initial.records[0].id });
  await settle();
  controller.send(supersededBy === 'another-detail' ? { type: 'open-detail', recordId: other.id }
    : { type: supersededBy === 'refresh' ? 'retry-book' : supersededBy === 'mutation' ? 'delete-confirm' : 'back-book' });
  await settle();
  lookup.reject(Object.assign(new Error('stale detail 401'), { code: 'unauthorized' }));
  await settle();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session?.owner_id, initial.session.owner_id, `${supersededBy}: superseded detail errors must not clear the owner`);
  assert.notEqual(controller.sessionRestoreStatus, 'failed', `${supersededBy}: superseded detail errors must not lock the new request or screen`);
  assert.equal(alerts.length, 0, `${supersededBy}: stale detail must not show cache guidance`);
}
console.log('useAppController.check passed: all four record lookups reauthenticate on final 401, preserve offline drafts/cache, and ignore stale owners, generations and detail requests');

{
  const initial = savingState();
  const b = savingState();
  const ownerB = 'owner-b';
  const draftB = { ...b.drafts.new, owner_id: ownerB };
  const attemptB = { ...b.save_attempt, owner_id: ownerB, operation_id: 'save-b' };
  const saveA = deferred();
  const saveB = deferred();
  const saves = [];
  let authListener;
  let listCalls = 0;
  const harness = controllerHarness(initial, {
    saveRecord: attempt => { saves.push(attempt.owner_id); return attempt.owner_id === ownerB ? saveB.promise : saveA.promise; },
    listRecords: () => { listCalls += 1; return new Promise(() => {}); },
  }, {
    client: { auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: callback => { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } },
    readDraftState: async owner => owner === ownerB ? { drafts: { new: draftB, edit: null }, save_attempt: attemptB } : null,
  });
  let controller = harness.render();
  harness.runEffects();
  controller.send({ type: 'retry-save' });
  await settle();
  assert.deepEqual(saves, [initial.session.owner_id], 'A save must remain pending before owner switch');
  authListener('SIGNED_IN', { user: { id: ownerB, email: 'b@example.com' }, access_token: 'token-b' });
  await settle();
  controller.send({ type: 'resume-draft', draftId: draftB.draft_id });
  controller.send({ type: 'retry-save' });
  await settle();
  assert.deepEqual(saves, [initial.session.owner_id, ownerB], 'B must be able to start its own save while A remains pending');
  const ready = attempt => ({ source: 'supabase', id: attempt.record_id, user_id: attempt.owner_id, status: 'ready', version: 1,
    stamp: attempt.payload_snapshot.stamp, fields: attempt.payload_snapshot.fields, color_tags: attempt.payload_snapshot.color_tags, created_at: new Date(0).toISOString() });
  saveA.resolve(ready(initial.save_attempt));
  await settle();
  const listsBeforeRetry = listCalls;
  controller.send({ type: 'retry-book' });
  controller.send({ type: 'back-book' });
  await settle();
  controller = harness.render();
  assert.equal(controller.state.session?.owner_id, ownerB, 'late A completion must preserve B session');
  assert.equal(controller.state.save_attempt.operation_id, attemptB.operation_id, 'late A completion must preserve B save');
  assert.equal(controller.state.save_attempt.state, 'pending', 'B save must still be pending after A completes');
  assert.equal(controller.state.route, 'summary', 'B navigation must remain locked while B is saving');
  assert.equal(listCalls, listsBeforeRetry, 'A finally must not unlock refresh while B is saving');
  saveB.resolve(ready(attemptB));
  await settle();
  controller = harness.render();
  assert.equal(controller.state.save_attempt.state, 'saved', 'B completion must release its own mutation normally');
  assert.equal(controller.state.records[0].user_id, ownerB, 'only B saved record may populate the current account');
  assert.equal(listCalls, listsBeforeRetry + 1, 'B completion must allow the normal post-save refresh');
}
console.log('useAppController.check passed: late A save completion cannot release B pending mutation or refresh lock');

// Both Book draft kinds use the existing persistence-first discard path.
for (const kind of ['new', 'edit']) {
  const initial = savingState('edit');
  const newState = savingState();
  const otherKind = kind === 'new' ? 'edit' : 'new';
  const drafts = { new: { ...newState.drafts.new, stage: 'photo_ready' }, edit: initial.drafts.edit };
  const pending = kind === 'new' ? initial.save_attempt : newState.save_attempt;
  const state = { ...initial, route: 'book', dialog: null, drafts, save_attempt: pending };
  const persisted = deferred();
  const writes = [];
  let serverCalls = 0;
  const unexpected = async () => { serverCalls += 1; throw new Error('local draft deletion must not call the server'); };
  const harness = controllerHarness(state, { abortSave: unexpected, fetchRecord: unexpected, deleteRecord: unexpected }, {
    writeDraftState: async (owner, snapshot) => { writes.push({ owner, snapshot }); await persisted.promise; },
  });
  let controller = harness.render();
  controller.send({ type: 'request-delete-draft', draftId: drafts[kind].draft_id });
  await settle();
  controller = harness.render();
  assert.equal(controller.state.dialog.draft_id, drafts[kind].draft_id);
  controller.send({ type: 'discard-save-cancel' });
  await settle();
  assert.deepEqual(harness.render().state.drafts, drafts, 'cancel preserves both drafts');
  controller.send({ type: 'request-delete-draft', draftId: drafts[kind].draft_id });
  await settle();
  controller.send({ type: 'discard-save-confirm' });
  await settle();
  assert.deepEqual(harness.render().state.drafts, drafts, 'do not hide a draft before persistence succeeds');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].snapshot.drafts[kind], null);
  persisted.resolve();
  await settle();
  controller = harness.render();
  assert.equal(controller.state.drafts[kind], null);
  assert.deepEqual(controller.state.drafts[otherKind], drafts[otherKind], 'keep the other draft');
  assert.deepEqual(controller.state.save_attempt, pending, 'keep the other draft save identity');
  assert.deepEqual(controller.state.records, initial.records, 'keep all saved records');
  assert.equal(serverCalls, 0);
}
{
  const original = savingState();
  const state = { ...original, route: 'book', dialog: null, save_attempt: null };
  const alerts = [];
  const harness = controllerHarness(state, {}, { writeDraftState: async () => { throw new Error('disk full'); } }, {}, alerts);
  const controller = harness.render();
  controller.send({ type: 'request-delete-draft', draftId: state.drafts.new.draft_id });
  await settle();
  controller.send({ type: 'discard-save-confirm' });
  await settle();
  assert.deepEqual(harness.render().state.drafts, state.drafts, 'failed local deletion preserves the draft');
  assert.equal(alerts.length, 1, 'failed persistence is visible');
}
console.log('useAppController.check passed: direct draft deletion preserves other work, saves and failed persistence');

// Exercise the actual Book buttons through the existing resume action, without native or service calls.
{
  const bookSource = readFileSync(new URL('./screens/BookScreen.tsx', import.meta.url), 'utf8');
  const mocks = {
    react: { ...React, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../primitives': { Button: 'Button', IconButton: 'IconButton', Notice: 'Notice', StampImage: 'StampImage' },
    '../components/FilterChip': { FilterChip: 'FilterChip' },
    '../components/RecordCard': { RecordCard: 'RecordCard' },
    '../components/AppIcon': { AppIcon: 'AppIcon' },
    '../components/SemanticText': { SemanticText: 'SemanticText' },
    '../sheets/FilterSheet': { FilterSheet: 'FilterSheet' },
    '../basic-copy': { getBasicCopy },
    '../theme': { theme: { colors: {}, typography: {}, radii: {}, shadows: {} } },
    '../record-copy': {}, '../record-writing': recordWriting,
    '../../../design/images/lineart-style1-source-rgb.png': 1,
  };
  const output = ts.transpileModule(bookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(id => {
    assert.ok(id in mocks, `Unexpected Book dependency: ${id}`);
    return mocks[id];
  }, exports);
  function nodes(element) {
    if (!React.isValidElement(element)) return [];
    if (typeof element.type === 'function') return nodes(element.type(element.props));
    return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
  }
  const initial = savingState('edit');
  const newDraft = { ...savingState().drafts.new, stage: 'photo_ready' };
  const editDraft = initial.drafts.edit;
  for (const locale of ['ko', 'en']) {
    for (const list_state of ['empty', 'ready', 'filter-empty', 'loading', 'error', 'partial-cache']) {
      for (const drafts of [[], [newDraft], [editDraft], [newDraft, editDraft], [editDraft, newDraft]]) {
        const snapshot = JSON.stringify(drafts);
        const resumed = [];
        const deleted = [];
        const state = { ...initial, route: 'book', save_attempt: null, drafts: { new: newDraft, edit: editDraft } };
        const rendered = nodes(exports.BookScreen({ locale, list_state, drafts, records: [], filter: {}, save_attempt: null,
          onResumeDraft: draftId => resumed.push(demoReducer(state, { type: 'resume-draft', draftId })),
          onDeleteDraft: draftId => deleted.push(draftId),
        }));
        const buttons = rendered.filter(node => node.type === 'Button' && node.props.tone === 'subtle');
        const deleteButtons = rendered.filter(node => node.type === 'IconButton' && /초안 삭제|Delete .*draft/.test(node.props.label));
        deleteButtons.forEach(button => button.props.onPress());
        assert.deepEqual(deleted, drafts.map(draft => draft.draft_id), 'every visible draft has its own delete action');
        assert.deepEqual(buttons.map(button => button.props.label), drafts.map(draft => drafts.length === 1
          ? locale === 'ko' ? '초안 1개 이어서 만들기' : 'Continue 1 draft'
          : locale === 'ko' ? draft.kind === 'new' ? '새 기록 이어가기' : '기록 편집 이어가기'
            : draft.kind === 'new' ? 'Continue new record' : 'Continue editing record'));
        buttons.forEach((button, index) => {
          button.props.onPress();
          assert.equal(resumed[index].active_draft_kind, drafts[index].kind);
          assert.equal(resumed[index].route, drafts[index].kind === 'new' ? 'photo' : 'summary');
          assert.equal(resumed[index].selected_record_id, drafts[index].kind === 'edit' ? drafts[index].record_id : null);
          assert.deepEqual(resumed[index].drafts, state.drafts, 'resuming must preserve both drafts');
        });
        assert.equal(JSON.stringify(drafts), snapshot);
      }
    }
  }
  console.log('useAppController.check passed: Book resumes every draft in both locales, all list states, zero/one/two drafts and reversed order');
}
