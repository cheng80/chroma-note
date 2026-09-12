import { demoReducer, initialDemoState } from './demo-state.ts';
import { acceptPhotoStep, beginPhotoProcessing, failPhotoStep, skipPhotoAnalysis } from './processing-state.ts';
import type { Analysis, DemoState, StampCandidate } from './contract.ts';

const assert = { equal(actual: unknown, expected: unknown, message = 'unexpected value') { if (actual !== expected) throw new Error(message); } };

let state: DemoState = demoReducer(initialDemoState(), { type: 'start-record' });
state = { ...state, session: { source: 'supabase', owner_id: 'owner-a', generation: 2, email: '', locale: 'ko' },
  model_status: 'ready',
  drafts: { new: { ...state.drafts.new!, owner_id: 'owner-a', photo: { source: 'device', local_uri: 'file:///photo.jpg', width: 100, height: 100, input_revision: 1 }, fields: { ...state.drafts.new!.fields, user_note: '사용자가 쓴 메모' } }, edit: null } };
const preparing = beginPhotoProcessing({ ...state, model_status: 'unprepared' }, 'prepare');
assert.equal(preparing.active_job?.step, 'prepare');
assert.equal(preparing.drafts.new?.stage, 'preparing');
const missingModel = failPhotoStep(preparing, preparing.active_job!, false, new Error('analysis_model_missing'));
const skipPreparation = skipPhotoAnalysis(missingModel, 'skip-prepare');
assert.equal(skipPreparation.active_job?.step, 'colors', 'missing VLM can be skipped before palette extraction');
const afterSkippedColors = acceptPhotoStep(skipPreparation, skipPreparation.active_job!, { step: 'colors', colors: { source: 'device', source_revision: 1, tags: [{ hex: '#FF0000', rgb: [255, 0, 0], weight: 1 }] } });
assert.equal(afterSkippedColors.active_job?.step, 'stamp', 'palette completion must retain the explicit AI skip');
assert.equal(afterSkippedColors.drafts.new?.fields.user_note, '사용자가 쓴 메모');
assert.equal(skipPhotoAnalysis(preparing, 'running'), preparing, 'running preparation cannot be silently skipped');
state = beginPhotoProcessing(state, 'first');
assert.equal(state.active_job?.step, 'colors');
const colorJob = state.active_job!;
state = acceptPhotoStep(state, colorJob, { step: 'colors', colors: { source: 'device', source_revision: 1, tags: [{ hex: '#FF0000', rgb: [255, 0, 0], weight: 1 }] } });
assert.equal(state.active_job?.step, 'analysis');
assert.equal(acceptPhotoStep(state, colorJob, { step: 'prepare' }), state, 'stale step cannot regress processing');
const analysis: Analysis = { source: 'device', status: 'success', source_revision: 1, scene: '풍경', semantic_tags: ['산'], mood: [], ai_field_note: '', ai_field_note_edited: null, user_modified_fields: [] };
const analysisJob = state.active_job!;
assert.equal(acceptPhotoStep({ ...state, session: { ...state.session!, generation: 3 } }, analysisJob, { step: 'analysis', analysis }).drafts.new?.analysis, null);
state = failPhotoStep(state, analysisJob);
assert.equal(state.drafts.new?.colors?.tags[0].hex, '#FF0000');
const skipped = skipPhotoAnalysis(state, 'skipped');
assert.equal(skipped.active_job?.step, 'stamp');
assert.equal(skipped.drafts.new?.analysis?.status, 'skipped');
state = beginPhotoProcessing(state, 'retry');
assert.equal(state.active_job?.step, 'analysis', 'retry keeps successful palette');
for (const [nativeError, errorCode] of [
  ['analysis_model_missing', 'model_missing'],
  ['analysis_model_corrupt', 'model_corrupt'],
  ['analysis_model_load_failed', 'model_corrupt'],
  ['analysis_unsupported_device', 'model_unsupported'],
  ['analysis_out_of_memory', 'model_out_of_memory'],
  ['analysis_timeout', 'model_timeout'],
] as const) {
  const modelFailed = failPhotoStep(state, state.active_job!, false, new Error(nativeError));
  assert.equal(modelFailed.drafts.new?.error_code, errorCode, `${nativeError} is classified for recovery`);
  assert.equal(modelFailed.model_status, 'failed');
  assert.equal(skipPhotoAnalysis(modelFailed, `skip-${nativeError}`).active_job?.step, 'stamp', 'skipping a failed analysis must not prepare the failed VLM again');
}
state = acceptPhotoStep(state, state.active_job!, { step: 'analysis', analysis });
assert.equal(state.drafts.new?.fields.user_note, '사용자가 쓴 메모');
assert.equal(state.drafts.new?.fields.ai_field_note, '', 'automatic analysis does not generate a note');
const stamp: StampCandidate = { source: 'device', input_revision: 1, candidate_id: 'stamp-1', local_uri: 'file:///lineart-1.png', width: 100, height: 100 };
const stampJob = state.active_job!;
assert.equal(acceptPhotoStep(state, stampJob, { step: 'stamp', stamp: { ...stamp, source: 'demo' } }), state, 'fixture cannot become a real photo result');
state = acceptPhotoStep(state, stampJob, { step: 'stamp', stamp });
assert.equal(state.route, 'compare');
assert.equal(state.comparison_tab, 'stamp');
assert.equal(state.drafts.new?.confirmation, null);
assert.equal(demoReducer(state, { type: 'save' }).save_attempt, null);
state = demoReducer(state, { type: 'confirm', value: true });
state = demoReducer(state, { type: 'continue-compare' });
state = demoReducer(state, { type: 'save' });
assert.equal(state.save_attempt?.payload_snapshot.stamp.local_uri, 'file:///lineart-1.png');
assert.equal(state.save_attempt?.payload_snapshot.fields.user_note, '사용자가 쓴 메모');
assert.equal(beginPhotoProcessing({ ...state, save_attempt: null }, 'completed').active_job, null, 'completed photo is not regenerated');
console.log('processing-state.check passed: actual results, ordered steps, retry/skip, stale owner/revision, memo preservation and explicit confirmation');
