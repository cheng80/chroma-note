import { DEMO_CODE, assertDemoInvariants, demoReducer, initialDemoState } from './demo-state.ts';

function login() {
  let state = initialDemoState();
  state = demoReducer(state, { type: 'email', value: 'demo@example.com' });
  state = demoReducer(state, { type: 'submit-email' });
  state = demoReducer(state, { type: 'code', value: DEMO_CODE });
  return demoReducer(state, { type: 'verify' });
}

function finishNew(state: ReturnType<typeof initialDemoState>) {
  state = demoReducer(state, { type: 'start-record' });
  state = demoReducer(state, { type: 'use-photo' });
  state = demoReducer(state, { type: 'continue-photo' });
  for (let index = 0; index < 4; index += 1) {
    const job = state.active_job;
    if (!job) break;
    state = demoReducer(state, { type: 'tick-processing', jobId: job.job_id, inputRevision: job.input_revision });
  }
  if (state.route !== 'compare' || !state.drafts.new?.selected_candidate) throw new Error('demo processing should reach comparison');
  state = demoReducer(state, { type: 'confirm', value: true });
  state = demoReducer(state, { type: 'continue-compare' });
  if (state.route !== 'summary') throw new Error('comparison confirmation should unlock summary');
  return state;
}

function memoSheet(state: ReturnType<typeof initialDemoState>) {
  const sheet = state.sheet;
  if (sheet?.kind !== 'memo') throw new Error('memo sheet should be open');
  return sheet;
}

let state = login();
state = finishNew(state);
state = demoReducer(state, { type: 'save' });
const firstOperation = state.save_attempt?.operation_id;
if (!firstOperation) throw new Error('valid draft should create a save operation');
state = demoReducer(state, { type: 'open-summary-sheet', kind: 'memo' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'memo', working: 'changed after save started' } });
state = demoReducer(state, { type: 'sheet-apply' });
state = demoReducer(state, { type: 'save-result', operationId: firstOperation, outcome: 'success' });
if (state.records.length !== 1 || !state.records[0] || state.records[0].fields.user_note !== '') throw new Error('save should use the pending snapshot');
const firstRecordId = state.records[0].id;
state = demoReducer(state, { type: 'save-result', operationId: firstOperation, outcome: 'success' });
if (state.records.length !== 1) throw new Error('duplicate save result must be ignored');

state = finishNew(state);
state = demoReducer(state, { type: 'save' });
const secondOperation = state.save_attempt?.operation_id;
if (!secondOperation || secondOperation === firstOperation) throw new Error('each new record needs a unique save operation');
state = demoReducer(state, { type: 'save-result', operationId: firstOperation, outcome: 'success' });
if (state.save_attempt?.operation_id !== secondOperation || state.records.length !== 1) throw new Error('late save result must be ignored');
state = demoReducer(state, { type: 'save-result', operationId: secondOperation, outcome: 'success' });
if (state.records.length !== 2 || state.records[0].id === state.records[1].id) throw new Error('two saves should keep unique records');

state = demoReducer(state, { type: 'open-detail', recordId: firstRecordId });
state = demoReducer(state, { type: 'edit-record' });
const editDraftId = state.drafts.edit?.draft_id;
if (!editDraftId) throw new Error('edit should create an edit draft');
state = demoReducer(state, { type: 'start-record' });
if (!state.drafts.edit || !state.drafts.new) throw new Error('new and edit drafts should coexist');
state = demoReducer(state, { type: 'cancel-record' });
if (!state.drafts.edit || !state.drafts.new || state.route !== 'book') throw new Error('cancel should preserve drafts and return to Book');
state = demoReducer(state, { type: 'resume-draft', draftId: editDraftId });
if (state.route !== 'summary' || state.active_draft_kind !== 'edit') throw new Error('resume-draft should select the requested draft');
state = demoReducer(state, { type: 'summary-back' });
if (state.route !== 'detail') throw new Error('edit summary back should return to detail');

state = demoReducer(state, { type: 'resume-draft', draftId: state.drafts.new!.draft_id });
state = demoReducer(state, { type: 'open-summary-sheet', kind: 'datePlace' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'datePlace', working: { diary_date: '2026-02-30', date_source: 'user', place_name: null } } });
state = demoReducer(state, { type: 'sheet-apply' });
if (!state.sheet || state.sheet.kind !== 'datePlace') throw new Error('invalid calendar date must be rejected');
state = demoReducer(state, { type: 'sheet-close' });
if (!state.dialog || state.dialog.kind !== 'discard-draft') throw new Error('dirty sheet close should ask for confirmation');
state = demoReducer(state, { type: 'sheet-discard-cancel' });
if (!state.sheet) throw new Error('sheet cancel should preserve dirty input');
state = demoReducer(state, { type: 'sheet-cancel' });
if (state.sheet) throw new Error('explicit sheet cancel should rollback and close');

let memoState = finishNew(login());
const memoDraft = memoState.drafts.new!;
const aiOriginal = '빛이 머문 길';
const aiEdited = '빛이 머문 산책길';
memoState = { ...memoState, drafts: { ...memoState.drafts, new: { ...memoDraft, analysis: memoDraft.analysis ? { ...memoDraft.analysis, ai_field_note: aiOriginal, ai_field_note_edited: aiEdited } : null, fields: { ...memoDraft.fields, ai_field_note: aiOriginal, ai_field_note_edited: aiEdited, user_note: '내가 쓴 메모' } } } };
memoState = demoReducer(memoState, { type: 'open-summary-sheet', kind: 'memo' });
if (memoSheet(memoState).caption_suggestion !== aiEdited || memoSheet(memoState).working !== '내가 쓴 메모') throw new Error('opening memo should offer AI writing without inserting it');
memoState = demoReducer(memoState, { type: 'sheet-change', change: { kind: 'memo', action: 'import-caption' } });
if (memoSheet(memoState).pending_import !== aiEdited || memoSheet(memoState).working !== '내가 쓴 메모') throw new Error('import should confirm before replacing existing memo');
memoState = demoReducer(memoState, { type: 'sheet-change', change: { kind: 'memo', action: 'confirm-caption-import' } });
if (memoSheet(memoState).working !== aiEdited || memoSheet(memoState).restore_value !== '내가 쓴 메모') throw new Error('confirmed import should retain one-step recovery');
memoState = demoReducer(memoState, { type: 'sheet-change', change: { kind: 'memo', action: 'restore' } });
if (memoSheet(memoState).working !== '내가 쓴 메모') throw new Error('restore should recover the replaced memo');
memoState = demoReducer(memoState, { type: 'sheet-change', change: { kind: 'memo', action: 'clear' } });
memoState = demoReducer(memoState, { type: 'sheet-apply' });
memoState = demoReducer(memoState, { type: 'open-summary-sheet', kind: 'memo' });
if (memoSheet(memoState).working !== '' || memoSheet(memoState).caption_suggestion !== aiEdited) throw new Error('cleared memo must stay empty when reopened');
memoState = demoReducer(memoState, { type: 'sheet-change', change: { kind: 'memo', action: 'import-caption' } });
memoState = demoReducer(memoState, { type: 'sheet-apply' });
memoState = demoReducer(memoState, { type: 'save' });
const memoOperation = memoState.save_attempt?.operation_id;
if (!memoOperation) throw new Error('memo draft should start saving');
memoState = demoReducer(memoState, { type: 'save-result', operationId: memoOperation, outcome: 'success' });
const memoRecord = memoState.records.find((record) => record.id === memoDraft.record_id);
if (!memoRecord || memoRecord.fields.user_note !== aiEdited || memoRecord.fields.ai_field_note !== aiOriginal || memoRecord.fields.ai_field_note_edited !== aiEdited) throw new Error('saving imported memo must preserve AI source fields');

let captionState = finishNew(login());
captionState = demoReducer(captionState, { type: 'open-summary-sheet', kind: 'memo' });
captionState = demoReducer(captionState, { type: 'request-caption' });
const firstCaptionRequest = memoSheet(captionState).caption_request_id;
const captionRevision = captionState.drafts.new!.input_revision;
if (!firstCaptionRequest) throw new Error('caption request needs an identity');
captionState = demoReducer(captionState, { type: 'sheet-change', change: { kind: 'memo', working: '입력 중인 메모' } });
captionState = demoReducer(captionState, { type: 'caption-result', requestId: firstCaptionRequest, inputRevision: captionRevision, outcome: 'success', value: '도착한 제안' });
if (memoSheet(captionState).working !== '입력 중인 메모' || memoSheet(captionState).caption_suggestion !== '도착한 제안') throw new Error('caption result must not overwrite memo typing');
captionState = demoReducer(captionState, { type: 'sheet-close' });
if (captionState.dialog?.kind !== 'discard-draft') throw new Error('closing a dirty memo should require discard confirmation');
captionState = demoReducer(captionState, { type: 'sheet-discard-cancel' });
if (memoSheet(captionState).working !== '입력 중인 메모') throw new Error('canceling discard should preserve memo typing');
captionState = demoReducer(captionState, { type: 'sheet-cancel' });
captionState = demoReducer(captionState, { type: 'open-summary-sheet', kind: 'memo' });
captionState = demoReducer(captionState, { type: 'request-caption' });
const retryCaptionRequest = memoSheet(captionState).caption_request_id;
if (!retryCaptionRequest || retryCaptionRequest === firstCaptionRequest) throw new Error('reopened caption request needs a new identity');
captionState = demoReducer(captionState, { type: 'caption-result', requestId: firstCaptionRequest, inputRevision: captionRevision, outcome: 'success', value: '늦은 제안' });
if (memoSheet(captionState).caption_suggestion === '늦은 제안') throw new Error('late caption result must be ignored');
captionState = demoReducer(captionState, { type: 'caption-result', requestId: retryCaptionRequest, inputRevision: captionRevision, outcome: 'failure' });
if (memoSheet(captionState).caption_status !== 'error') throw new Error('caption failure should be retryable');
captionState = demoReducer(captionState, { type: 'request-caption' });
if (memoSheet(captionState).caption_status !== 'pending' || memoSheet(captionState).caption_request_id === retryCaptionRequest) throw new Error('caption retry should start a fresh request');

let invalid = login();
invalid = demoReducer(invalid, { type: 'start-record' });
invalid = demoReducer(invalid, { type: 'save' });
if (invalid.save_attempt) throw new Error('invalid save must not start an operation');
assertDemoInvariants(state);
console.log('demo-state.check passed');
