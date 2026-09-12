import { demoReducer, discardSaveMode, initialDemoState } from './demo-state.ts';

let state = initialDemoState();
state = demoReducer(state, { type: 'email', value: 'demo@example.com' });
state = demoReducer(state, { type: 'submit-email' });
state = demoReducer(state, { type: 'code', value: '123456' });
state = demoReducer(state, { type: 'verify' });
state = demoReducer(state, { type: 'start-record' });
state = demoReducer(state, { type: 'use-photo' });
state = demoReducer(state, { type: 'continue-photo' });
for (let index = 0; index < 4 && state.active_job; index += 1) {
  state = demoReducer(state, { type: 'tick-processing', jobId: state.active_job.job_id, inputRevision: state.active_job.input_revision });
}
state = demoReducer(state, { type: 'confirm', value: true });
state = demoReducer(state, { type: 'continue-compare' });
state = demoReducer(state, { type: 'save' });
const attempt = state.save_attempt;
if (!attempt) throw new Error('save attempt should exist');
state = demoReducer(state, { type: 'save-result', operationId: attempt.operation_id, outcome: 'failed' });
const draft = state.drafts.new;
const stampUri = draft?.selected_candidate?.local_uri;
state = demoReducer(state, { type: 'cancel-record' });
if (state.route !== 'book' || state.drafts.new !== draft || state.save_attempt?.operation_id !== attempt.operation_id || state.drafts.new?.selected_candidate?.local_uri !== stampUri || state.dialog) {
  throw new Error('leaving a failed save must keep the draft, color sketch, inputs, and save attempt without a discard dialog');
}
state = demoReducer(state, { type: 'resume-draft', draftId: draft!.draft_id });
if (state.route !== 'summary' || state.save_attempt || state.drafts.new?.selected_candidate?.local_uri !== stampUri || state.drafts.new?.fields !== draft?.fields) {
  throw new Error('reopening a confirmed failed save must restore the same editable draft and clear only the failed attempt');
}

state = demoReducer(state, { type: 'save' });
const discardAttempt = state.save_attempt;
if (!discardAttempt) throw new Error('discard check save attempt should exist');
state = demoReducer(state, { type: 'save-result', operationId: discardAttempt.operation_id, outcome: 'uncertain' });
if (discardSaveMode(state.save_attempt, state.drafts.new) !== 'abort') throw new Error('an uncertain create must use abort before local discard');
state = demoReducer(state, { type: 'request-discard-save' });
if (state.dialog?.kind !== 'discard-save') throw new Error('an uncertain save must offer explicit draft discard confirmation');
const beforeFailedDiscard = state;
state = demoReducer(state, { type: 'discard-save-result', draftId: discardAttempt.draft_id, operationId: discardAttempt.operation_id, outcome: 'failed' });
if (state.drafts.new !== beforeFailedDiscard.drafts.new || state.save_attempt !== beforeFailedDiscard.save_attempt) throw new Error('an unconfirmed abort must preserve the draft, photo, input, and save attempt');
state = demoReducer(state, { type: 'request-discard-save' });
const beforeStaleDiscard = state;
state = demoReducer(state, { type: 'discard-save-result', draftId: discardAttempt.draft_id, operationId: 'stale-operation', outcome: 'success' });
if (state !== beforeStaleDiscard) throw new Error('a stale abort response must not discard the current draft');
state = demoReducer(state, { type: 'discard-save-result', draftId: discardAttempt.draft_id, operationId: discardAttempt.operation_id, outcome: 'success' });
if (state.route !== 'book' || state.drafts.new || state.save_attempt) throw new Error('a confirmed abort must remove only its local draft and save attempt');

const editDraft = { ...draft!, kind: 'edit' as const, base_record_version: 3 };
const editAttempt = { ...beforeFailedDiscard.save_attempt!, draft_id: editDraft.draft_id, record_id: editDraft.record_id, base_version: editDraft.base_record_version };
if (discardSaveMode(editAttempt, editDraft) !== 'local') throw new Error('an edit draft discard must stay local and never abort or delete its server record');
if (discardSaveMode({ ...editAttempt, state: 'saved' }, editDraft) !== null) throw new Error('an already-ready save must never enter the discard path');
console.log('save-failure-exit.check passed');
