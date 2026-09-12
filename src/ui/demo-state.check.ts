import { DEMO_CODE, assertDemoInvariants, demoReducer, displayLocale, initialDemoState } from './demo-state.ts';

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

function analysisSheet(state: ReturnType<typeof initialDemoState>) {
  const sheet = state.sheet;
  if (sheet?.kind !== 'analysis') throw new Error('writing sheet should be open');
  return sheet;
}

if (displayLocale('system', 'ko-KR') !== 'ko' || displayLocale('system', 'fr-FR') !== 'en' || displayLocale('ko', 'en-US') !== 'ko') throw new Error('explicit locale must override the supported system locale fallback');

let state = login();
state = finishNew(state);
const selectedCandidateId = state.drafts.new?.selected_candidate?.candidate_id;
state = demoReducer(state, { type: 'regenerate' });
if (state.drafts.new?.selected_candidate?.candidate_id !== selectedCandidateId || state.drafts.new?.pending_candidate) throw new Error('comparison must keep its single deterministic candidate');
state = demoReducer(state, { type: 'save' });
const firstOperation = state.save_attempt?.operation_id;
if (!firstOperation) throw new Error('valid draft should create a save operation');
state = demoReducer(state, { type: 'open-summary-sheet', kind: 'analysis' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'analysis', working: { ...analysisSheet(state).working, user_note: 'changed after save started' } } });
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

state = demoReducer(state, { type: 'open-summary-sheet', kind: 'analysis' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'analysis', working: { ...analysisSheet(state).working, user_note: '🙂'.repeat(2000) } } });
state = demoReducer(state, { type: 'sheet-apply' });
if (state.sheet || state.drafts.new?.fields.user_note !== '🙂'.repeat(2000)) throw new Error('text limits must count Unicode code points like the server');
state = demoReducer(state, { type: 'open-summary-sheet', kind: 'analysis' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'analysis', working: { ...analysisSheet(state).working, user_note: 'e\u0301' } } });
state = demoReducer(state, { type: 'sheet-apply' });
if (state.sheet?.kind !== 'analysis' || !state.sheet.error) throw new Error('non-NFC text must be rejected before saving');
state = demoReducer(state, { type: 'sheet-cancel' });
state = demoReducer(state, { type: 'open-summary-sheet', kind: 'analysis' });
if (state.sheet?.kind !== 'analysis') throw new Error('analysis sheet should be open');
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'analysis', working: { ...state.sheet.working, semantic_tags: ['카페', '카페'] } } });
state = demoReducer(state, { type: 'sheet-apply' });
if (state.sheet?.kind !== 'analysis' || !state.sheet.error) throw new Error('duplicate tags must be rejected before saving');
state = demoReducer(state, { type: 'sheet-cancel' });

let writingState = finishNew(login());
const writingDraft = writingState.drafts.new!;
const aiOriginal = '빛이 머문 길';
const aiEdited = '빛이 머문 산책길';
writingState = { ...writingState, drafts: { ...writingState.drafts, new: { ...writingDraft, analysis: writingDraft.analysis ? { ...writingDraft.analysis, ai_field_note: aiOriginal, ai_field_note_edited: aiEdited } : null, fields: { ...writingDraft.fields, ai_field_note: aiOriginal, ai_field_note_edited: aiEdited, user_note: '내가 쓴 메모' } } } };
writingState = demoReducer(writingState, { type: 'open-summary-sheet', kind: 'analysis' });
if (analysisSheet(writingState).working.ai_field_note_edited !== '' || analysisSheet(writingState).working.user_note !== `내가 쓴 메모\n\n${aiEdited}`) throw new Error('the single writing field must preserve both legacy texts');
writingState = demoReducer(writingState, { type: 'request-caption' });
const firstCaptionRequest = analysisSheet(writingState).caption_request_id;
const captionRevision = writingState.drafts.new!.input_revision;
if (!firstCaptionRequest) throw new Error('caption request needs an identity');
writingState = demoReducer(writingState, { type: 'sheet-change', change: { kind: 'analysis', working: { ...analysisSheet(writingState).working, user_note: '입력 중인 메모' } } });
writingState = demoReducer(writingState, { type: 'caption-result', requestId: firstCaptionRequest, inputRevision: captionRevision, outcome: 'success', value: '따뜻한 조명 아래 머문 계단' });
if (analysisSheet(writingState).working.ai_field_note_edited !== '' || analysisSheet(writingState).working.user_note !== '입력 중인 메모\n\n따뜻한 조명 아래 머문 계단') throw new Error('generated AI writing must append to the single field');
writingState = demoReducer(writingState, { type: 'sheet-cancel' });
writingState = demoReducer(writingState, { type: 'open-summary-sheet', kind: 'analysis' });
writingState = demoReducer(writingState, { type: 'request-caption' });
const retryCaptionRequest = analysisSheet(writingState).caption_request_id;
if (!retryCaptionRequest || retryCaptionRequest === firstCaptionRequest) throw new Error('reopened caption request needs a new identity');
writingState = demoReducer(writingState, { type: 'caption-result', requestId: firstCaptionRequest, inputRevision: captionRevision, outcome: 'success', value: '늦은 제안' });
if (analysisSheet(writingState).working.user_note.includes('늦은 제안')) throw new Error('late caption result must be ignored');
writingState = demoReducer(writingState, { type: 'caption-result', requestId: retryCaptionRequest, inputRevision: captionRevision, outcome: 'failure' });
if (analysisSheet(writingState).caption_status !== 'error' || analysisSheet(writingState).working.user_note !== `내가 쓴 메모\n\n${aiEdited}`) throw new Error('caption failure must preserve the user note and remain retryable');
writingState = demoReducer(writingState, { type: 'request-caption' });
if (analysisSheet(writingState).caption_status !== 'pending' || analysisSheet(writingState).caption_request_id === retryCaptionRequest) throw new Error('caption retry should start a fresh request');

let invalid = login();
invalid = demoReducer(invalid, { type: 'start-record' });
invalid = demoReducer(invalid, { type: 'save' });
if (invalid.save_attempt) throw new Error('invalid save must not start an operation');
assertDemoInvariants(state);
console.log('demo-state.check passed');
