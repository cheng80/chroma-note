import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as demo from '../demo-state.ts';
import * as app from '../app-state.ts';
import * as processing from '../processing-state.ts';
import * as dates from '../sheets/date-place.ts';

const source = readFileSync(new URL('./usePhotoWorkflow.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deadline = setTimeout(() => { throw new Error('photo workflow stalled, possibly awaiting its own serial queue'); }, 10_000);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function photoState() {
  const s = demo.demoReducer(demo.initialDemoState(), { type: 'start-record' });
  return { ...s, session: { source: 'supabase', owner_id: 'owner-a', generation: 2, email: '', locale: 'ko' }, model_status: 'ready',
    drafts: { ...s.drafts, new: { ...s.drafts.new, owner_id: 'owner-a', photo: { source: 'device', local_uri: 'file:///photo.jpg', width: 100, height: 100, input_revision: 1 }, fields: { ...s.drafts.new.fields, user_note: '직접 쓴 메모' } } } };
}
const colors = { source: 'device', source_revision: 1, tags: [{ hex: '#FF0000', rgb: [255, 0, 0], weight: 1 }] };
const analysis = { source: 'device', source_revision: 1, status: 'success', scene: '풍경', semantic_tags: ['산'], mood: [], ai_field_note: '', ai_field_note_edited: null, user_modified_fields: [] };
const stamp = { source: 'device', input_revision: 1, candidate_id: 'stamp', local_uri: 'file:///stamp.png', width: 100, height: 100 };
function stampState() {
  const s = photoState();
  return { ...s, drafts: { ...s.drafts, new: { ...s.drafts.new, colors, analysis } } };
}
function harness(initial = photoState(), overrides = {}) {
  let state = initial, mounted = true, queue = Promise.resolve(), index = 0, workflow;
  const slots = [], effects = [], listeners = new Map(), removed = [], notices = [], failures = [];
  const memo = (create, deps) => {
    const i = index++;
    if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i].deps[j]))) slots[i] = { deps, value: create() };
    return slots[i].value;
  };
  const react = {
    useRef: value => memo(() => ({ current: value }), []),
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect(effect, deps) {
      const i = index++;
      if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i].deps[j]))) {
        const old = slots[i];
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const store = {
    getState: () => state,
    isMounted: () => mounted,
    isCurrent: session => mounted && app.sameSession(state, session.owner_id, session.generation),
    notice: (...message) => notices.push(message),
    async apply(next, persist = true) {
      if (!mounted) return;
      await overrides.beforeApply?.(next, persist);
      if (mounted) state = next;
    },
    enqueue(work) { queue = queue.then(work).catch(error => { failures.push(error); }); return queue; },
  };
  const mocks = {
    react,
    'react-native': { AppState: { addEventListener: (event, listener) => { listeners.set(event, listener); return { remove: () => listeners.delete(event) }; } } },
    'expo-crypto': { randomUUID: () => 'photo-job' },
    '../../services/photo-input': { pickPhoto: overrides.pick ?? (async () => null), photoInputFailure: () => ({ message: { ko: '입력 실패', en: 'input failed' } }), removeWorkingPhoto: (owner, photo) => removed.push([owner, photo.local_uri]) },
    '../../services/photo-processing': { processPhotoStep: overrides.process ?? (async () => { throw new Error('unused step'); }) },
    '../../../modules/chroma-analysis': { preparePhotoAnalysis: overrides.prepare ?? (async () => undefined), unloadPhotoAnalysis: overrides.unload ?? (async () => true), generatePhotoNote: overrides.caption ?? (async () => { throw new Error('unused caption'); }) },
    '../demo-state': demo, '../app-state': app, '../processing-state': processing, '../sheets/date-place': dates,
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => { assert.ok(id in mocks, `missing mock: ${id}`); return mocks[id]; }, module, module.exports);
  function render() { index = 0; workflow = module.exports.usePhotoWorkflow(store, state); effects.splice(0).forEach(effect => effect()); }
  render();
  return {
    store, removed, notices, failures,
    get workflow() { return workflow; },
    async send(action) { let handled; await store.enqueue(async () => { handled = await workflow.handle(action); }); render(); return handled; },
    async flush() { for (let i = 0; i < 5; i++) { await tick(); await queue; render(); } return state; },
    memory() { listeners.get('memoryWarning')?.(); },
    unmount() { mounted = false; slots.forEach(slot => slot.cleanup?.()); },
  };
}

{
  const calls = [];
  const h = harness(photoState(), { process: async (_photo, job) => {
    calls.push(job.step);
    return job.step === 'colors' ? { step: 'colors', colors } : job.step === 'analysis' ? { step: 'analysis', analysis } : { step: 'stamp', stamp };
  } });
  assert.deepEqual(Object.keys(h.workflow).sort(), ['background', 'cancel', 'cancelCaption', 'handle']);
  assert.equal(await h.send({ type: 'back-book' }), false);
  assert.equal(await h.send({ type: 'continue-photo' }), true);
  const s = await h.flush();
  assert.deepEqual(calls, ['colors', 'analysis', 'stamp']);
  assert.equal(s.route, 'compare');
  assert.equal(s.drafts.new.fields.user_note, '직접 쓴 메모');
  await h.send({ type: 'resume-draft', draftId: s.drafts.new.draft_id });
  await h.flush();
  assert.equal(calls.length, 3, 'completed outputs must not run again');
  h.unmount();
}

for (const stop of ['cancel', 'background', 'unmount', 'session']) {
  const pending = deferred();
  let signal;
  const h = harness(stampState(), { process: (_photo, _job, _locale, value) => { signal = value; return pending.promise; } });
  await h.send({ type: 'continue-photo' });
  if (stop === 'cancel') await h.send({ type: 'cancel-record' });
  if (stop === 'background') h.workflow.background();
  if (stop === 'unmount') h.unmount();
  if (stop === 'session') {
    h.workflow.cancel();
    await h.store.apply({ ...h.store.getState(), session: { ...h.store.getState().session, generation: 3 }, active_job: null });
  }
  assert.equal(signal.aborted, true, `${stop} must abort the actual service signal`);
  pending.resolve({ step: 'stamp', stamp });
  await h.flush();
  assert.deepEqual(h.removed, [['owner-a', stamp.local_uri]], 'discard only the late generated file');
  assert.equal(h.store.getState().drafts.new.selected_candidate, null);
  if (stop === 'background') assert.equal(h.store.getState().active_job.error_code, 'interrupted');
  h.unmount();
}

{
  const h = harness(stampState(), { process: async () => ({ step: 'stamp', stamp }), beforeApply: (next, persist) => { if (persist && next.route === 'compare') throw new Error('disk full'); } });
  await h.send({ type: 'continue-photo' });
  await h.flush();
  assert.deepEqual(h.removed, [['owner-a', stamp.local_uri]]);
  assert.equal(h.store.getState().drafts.new.photo.local_uri, 'file:///photo.jpg');
  assert.equal(h.store.getState().active_job.status, 'failed');
  assert.equal(h.failures.length, 1);
  h.unmount();
}

{
  const h = harness(photoState(), { process: async (_photo, job) => {
    if (job.step === 'analysis') throw new Error('schema_error');
    return job.step === 'colors' ? { step: 'colors', colors } : { step: 'stamp', stamp };
  } });
  await h.send({ type: 'continue-photo' });
  await h.flush();
  assert.equal(h.store.getState().active_job.status, 'failed');
  assert.equal(await h.send({ type: 'retry-processing' }), true);
  await h.flush();
  assert.equal(await h.send({ type: 'skip-analysis' }), true);
  await h.flush();
  assert.equal(h.store.getState().drafts.new.analysis.status, 'skipped');
  assert.equal(h.store.getState().route, 'compare');
  h.unmount();
}

for (const changed of [false, true]) {
  const pending = deferred();
  const h = harness(demo.demoReducer(photoState(), { type: 'open-summary-sheet', kind: 'analysis' }), { caption: () => pending.promise });
  assert.equal(await h.send({ type: 'request-caption' }), true);
  if (changed) {
    const s = h.store.getState();
    await h.store.apply({ ...s, sheet: { ...s.sheet, working: { ...s.sheet.working, user_note: '생성 중 새로 쓴 글' } } });
  }
  pending.resolve({ inputRevision: 1, text: '햇빛을 머금은 고요한 풍경' });
  await h.flush();
  const s = h.store.getState();
  if (changed) {
    assert.equal(s.sheet.working.user_note, '생성 중 새로 쓴 글');
    assert.equal(s.sheet.caption_status, 'idle');
  } else {
    const next = app.preserveAdoptedCaption(s, demo.demoReducer(s, { type: 'sheet-apply' }));
    assert.equal(next.drafts.new.fields.ai_field_note, '햇빛을 머금은 고요한 풍경');
    assert.ok(next.drafts.new.fields.user_note.includes('직접 쓴 메모'));
  }
  h.unmount();
}

for (const stop of ['cancelCaption', 'cancel', 'background', 'unmount']) {
  const pending = deferred();
  let signal;
  const h = harness(demo.demoReducer(photoState(), { type: 'open-summary-sheet', kind: 'analysis' }), { caption: (_input, value) => { signal = value; return pending.promise; } });
  await h.send({ type: 'request-caption' });
  if (stop === 'unmount') h.unmount(); else h.workflow[stop]();
  assert.equal(signal.aborted, true);
  pending.resolve({ inputRevision: 1, text: '늦게 반환된 문구' });
  await h.flush();
  assert.equal(h.store.getState().sheet.working.user_note, '직접 쓴 메모');
  h.unmount();
}

for (const stale of [false, true]) {
  const pending = deferred();
  let picks = 0;
  const h = harness(photoState(), { pick: () => { picks++; return pending.promise; } });
  await h.send({ type: 'start-record' });
  assert.equal(h.store.getState().dialog.kind, 'replace-photo');
  assert.equal(picks, 0);
  await h.send({ type: 'replace-photo-confirm' });
  await h.send({ type: 'use-photo' });
  assert.equal(picks, 1, 'picker lock must survive renders');
  if (stale) await h.store.apply({ ...h.store.getState(), session: { ...h.store.getState().session, generation: 3 } });
  pending.resolve({ ...photoState().drafts.new.photo, input_revision: 2, local_uri: 'file:///replacement.jpg', captured_date: '2026-08-09' });
  await h.flush();
  assert.deepEqual(h.removed, [['owner-a', stale ? 'file:///replacement.jpg' : 'file:///photo.jpg']]);
  if (!stale) {
    assert.equal(h.store.getState().drafts.new.fields.user_note, '직접 쓴 메모');
    assert.equal(h.store.getState().drafts.new.fields.diary_date, '2026-08-09');
  }
  h.unmount();
}

{
  let unloaded = 0;
  const pending = deferred();
  const h = harness({ ...photoState(), model_status: 'unprepared' }, { prepare: () => pending.promise, unload: async () => { unloaded++; return true; } });
  await h.flush();
  assert.equal(h.store.getState().model_status, 'preparing');
  h.memory();
  await h.send({ type: 'retry-model' });
  assert.equal(unloaded, 0, 'busy preparation must retain its engine');
  pending.resolve();
  await h.flush();
  assert.equal(h.store.getState().model_status, 'ready');
  h.memory();
  await h.flush();
  assert.equal(unloaded, 1);
  assert.equal(h.store.getState().model_status, 'failed');
  assert.equal(await h.send({ type: 'retry-model' }), true);
  await h.flush();
  assert.equal(h.store.getState().model_status, 'ready');
  h.unmount();
}

clearTimeout(deadline);
console.log('usePhotoWorkflow.check passed: serial queue, processing/retry/skip, native abort signals, stale output cleanup, persistence failure, caption snapshot, picker lock, model lifecycle');
