import { demoReducer, initialDemoState } from './demo-state.ts';

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
console.log('save-failure-exit.check passed');
