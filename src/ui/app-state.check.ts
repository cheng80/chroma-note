import { acceptCaptionResult, acceptSavedRecord, preserveAdoptedCaption, replaceDraftPhoto, sameSession, signedOutState } from './app-state.ts';
import { demoReducer, initialDemoState } from './demo-state.ts';
import type { DemoRecord } from './contract.ts';
import { recordWriting } from './record-writing.ts';

const assert = {
  equal(actual: unknown, expected: unknown, message = 'unexpected value') { if (actual !== expected) throw new Error(message); },
  deepEqual(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('unexpected structure'); },
};

let state = { ...initialDemoState(), session: { source: 'supabase' as const, owner_id: 'account-a', generation: 2, email: 'test@example.invalid', locale: 'ko' as const } };
state = demoReducer(state, { type: 'start-record' }) as typeof state;
const draft = state.drafts.new!;
const stamp = { source: 'demo' as const, candidate_id: 'candidate', input_revision: 1, local_uri: 'demo-stamp', width: 1264, height: 848 };
state = { ...state, drafts: { ...state.drafts, new: { ...draft, owner_id: 'account-a' } }, save_attempt: { operation_id: 'operation', record_id: draft.record_id, owner_id: 'account-a', draft_id: draft.draft_id, state: 'uncertain', payload_snapshot: { fields: draft.fields, stamp, color_tags: [], confirmation: null } } };
const record: DemoRecord = { source: 'supabase', id: draft.record_id, user_id: 'account-a', version: 7, status: 'ready', stamp, fields: draft.fields, color_tags: [], created_at: '2026-09-11T00:00:00Z' };
assert.equal(acceptSavedRecord(state, 'stale-operation', record), state);
assert.equal(acceptSavedRecord(state, 'operation', { ...record, user_id: 'account-b' }), state);
const saved = acceptSavedRecord(state, 'operation', record);
assert.equal(saved.records[0].version, 7, 'server version is authoritative');
assert.equal(saved.drafts.new, null);
assert.equal(saved.save_attempt?.state, 'saved');
assert.equal(acceptSavedRecord(saved, 'operation', record), saved, 'duplicate completion is ignored');
assert.equal(sameSession(state, 'account-a', 1), false, 'old same-account session is stale');
assert.equal(sameSession(state, 'account-b', 2), false);
assert.equal(sameSession(state, 'account-a', 2), true);
const caption = '빛이 머문 산책길';
const writing = { scene: draft.fields.scene, semantic_tags: draft.fields.semantic_tags, mood_tags: draft.fields.mood_tags, ai_field_note_edited: '', user_note: `직접 쓴 메모\n\n${caption}` };
const adopting = { ...state, save_attempt: null, sheet: { kind: 'analysis' as const, initial: writing, working: writing, error: null, caption_status: 'success' as const, caption_suggestion: caption, caption_request_id: null } };
const adopted = preserveAdoptedCaption(adopting, demoReducer(adopting, { type: 'sheet-apply' }));
assert.equal(adopted.drafts.new?.fields.ai_field_note, caption, 'a generated caption keeps its AI source');
assert.equal(adopted.drafts.new?.fields.user_note, writing.user_note, 'applying AI writing must preserve the unified content');
assert.equal(adopted.drafts.new?.fields.ai_field_note_edited, '', 'the AI source must not be displayed separately');
const sceneEdited = { ...adopting, sheet: { ...adopting.sheet, working: { ...writing, scene: '창가에 놓인 꽃' } } };
const sceneApplied = demoReducer(sceneEdited, { type: 'sheet-apply' });
assert.equal(sceneApplied.drafts.new?.fields.scene, '창가에 놓인 꽃', 'editing a scene updates the draft');
const sceneDeleted = demoReducer({ ...adopting, sheet: { ...adopting.sheet, working: { ...writing, scene: null } } }, { type: 'sheet-apply' });
assert.equal(sceneDeleted.drafts.new?.fields.scene, null, 'clearing a scene removes it from the draft');
const longScene = demoReducer({ ...adopting, sheet: { ...adopting.sheet, working: { ...writing, scene: '가'.repeat(121) } } }, { type: 'sheet-apply' });
assert.equal(longScene.sheet?.kind === 'analysis' ? longScene.sheet.error : null, 'analysis-invalid', 'a scene over 120 characters is rejected');
const supplementaryScene = '😀'.repeat(120);
const supplementarySceneApplied = demoReducer({ ...adopting, sheet: { ...adopting.sheet, working: { ...writing, scene: supplementaryScene } } }, { type: 'sheet-apply' });
assert.equal(supplementarySceneApplied.drafts.new?.fields.scene, supplementaryScene, '120 supplementary-plane scene characters are accepted');
const longSupplementaryScene = demoReducer({ ...adopting, sheet: { ...adopting.sheet, working: { ...writing, scene: '😀'.repeat(121) } } }, { type: 'sheet-apply' });
assert.equal(longSupplementaryScene.sheet?.kind === 'analysis' ? longSupplementaryScene.sheet.error : null, 'analysis-invalid', '121 supplementary-plane scene characters are rejected');
const typing = { ...adopting, sheet: { ...adopting.sheet, working: { ...writing, user_note: '직접 고친 글' } } };
const typed = preserveAdoptedCaption(typing, demoReducer(typing, { type: 'sheet-apply' }));
assert.equal(typed.drafts.new?.fields.ai_field_note, caption, 'editing a generated caption must retain its AI source');
const previousCaptionState = { ...typing, drafts: { ...typing.drafts, new: { ...typing.drafts.new!, fields: { ...typing.drafts.new!.fields, ai_field_note: '이전 AI 글' } } } };
const regenerated = preserveAdoptedCaption(previousCaptionState, demoReducer(previousCaptionState, { type: 'sheet-apply' }));
assert.equal(regenerated.drafts.new?.fields.ai_field_note, caption, 'an adopted regeneration replaces the previous AI source');
const direct = { ...typing, sheet: { ...typing.sheet, caption_suggestion: null } };
const directlyTyped = preserveAdoptedCaption(direct, demoReducer(direct, { type: 'sheet-apply' }));
assert.equal(directlyTyped.drafts.new?.fields.ai_field_note, '', 'typing without generation must not create an AI source');
const requested = demoReducer(adopting, { type: 'request-caption' });
const requestId = requested.sheet?.kind === 'analysis' ? requested.sheet.caption_request_id : null;
if (!requestId || requested.sheet?.kind !== 'analysis') throw new Error('caption request must start');
const editedWhileGenerating = demoReducer(requested, {
  type: 'sheet-change',
  change: { kind: 'analysis', working: { ...requested.sheet.working, user_note: '생성 중 고친 글' } },
});
const lateCaption = acceptCaptionResult(editedWhileGenerating, requestId, draft.input_revision, writing.user_note, 'success', '늦게 도착한 AI 글');
assert.equal(lateCaption.sheet?.kind === 'analysis' ? lateCaption.sheet.working.ai_field_note_edited : null, '', 'a late caption must not recreate a separate AI field');
assert.equal(lateCaption.sheet?.kind === 'analysis' ? lateCaption.sheet.working.user_note : null, '생성 중 고친 글', 'a late caption must not append to writing edited while generating');
assert.equal(lateCaption.sheet?.kind === 'analysis' ? lateCaption.sheet.caption_status : null, 'idle', 'ignored completion must stop the pending state');
const tagsOnlyEdit = demoReducer(requested, { type: 'sheet-change', change: { kind: 'analysis', working: { ...requested.sheet.working, semantic_tags: ['산책'] } } });
const acceptedCaption = acceptCaptionResult(tagsOnlyEdit, requestId, draft.input_revision, writing.user_note, 'success', '새 AI 글');
assert.equal(acceptedCaption.sheet?.kind === 'analysis' ? acceptedCaption.sheet.working.ai_field_note_edited : null, '');
assert.equal(acceptedCaption.sheet?.kind === 'analysis' ? acceptedCaption.sheet.working.user_note : null, `${writing.user_note}\n\n새 AI 글`);
assert.deepEqual(acceptedCaption.sheet?.kind === 'analysis' ? acceptedCaption.sheet.working.semantic_tags : null, ['산책']);
assert.equal(acceptCaptionResult(requested, 'stale-request', draft.input_revision, writing.user_note, 'success', caption), requested);
assert.equal(acceptCaptionResult(demoReducer(requested, { type: 'sheet-cancel' }), requestId, draft.input_revision, writing.user_note, 'success', caption).sheet, null, 'canceling prevents late results from reopening the sheet');
const clearedDuringGeneration = demoReducer(requested, { type: 'sheet-change', change: { kind: 'analysis', working: { ...requested.sheet.working, user_note: '' } } });
const ignoredAfterClear = acceptCaptionResult(clearedDuringGeneration, requestId, draft.input_revision, writing.user_note, 'success', caption);
assert.equal(ignoredAfterClear.sheet?.kind === 'analysis' ? ignoredAfterClear.sheet.working.user_note : null, '', 'a late result must not refill cleared writing');
const clearedApplied = preserveAdoptedCaption(ignoredAfterClear, demoReducer(ignoredAfterClear, { type: 'sheet-apply' }));
assert.equal(recordWriting(clearedApplied.drafts.new!.fields), '', 'clearing the unified editor must hide the retained AI source');
assert.equal(clearedApplied.drafts.new?.fields.ai_field_note, caption, 'clear must preserve AI provenance');
const clearedReopened = demoReducer(clearedApplied, { type: 'open-summary-sheet', kind: 'analysis' });
assert.equal(clearedReopened.sheet?.kind === 'analysis' ? clearedReopened.sheet.working.user_note : null, '', 'cleared writing stays clear on re-entry');

// Legacy content is converted only in the sheet until the user applies it.
const legacyFields = { ...draft.fields, user_note: '  내 글\n다음 줄  ', ai_field_note: '생성 원문', ai_field_note_edited: '  고친 AI 글\n' };
const legacyDraft = { ...draft, fields: legacyFields };
const legacyState = { ...state, save_attempt: null, drafts: { ...state.drafts, new: legacyDraft } };
const legacyOpened = demoReducer(legacyState, { type: 'open-summary-sheet', kind: 'analysis' });
if (legacyOpened.sheet?.kind !== 'analysis') throw new Error('legacy editor must open');
assert.equal(legacyOpened.sheet.working.user_note, '  내 글\n다음 줄  \n\n  고친 AI 글\n');
assert.equal(legacyOpened.sheet.working.ai_field_note_edited, '');
assert.deepEqual(legacyOpened.sheet.initial, legacyOpened.sheet.working);
assert.equal(legacyOpened.drafts.new, legacyDraft, 'opening must not mutate the draft');
assert.equal(demoReducer(legacyOpened, { type: 'sheet-cancel' }).drafts.new, legacyDraft, 'cancel is a draft no-op');
const unchangedClosed = demoReducer(legacyOpened, { type: 'sheet-close' });
assert.equal(unchangedClosed.sheet, null, 'normalization alone must not mark the sheet dirty');
assert.equal(unchangedClosed.dialog, null);
const legacyChanged = demoReducer(legacyOpened, { type: 'sheet-change', change: { kind: 'analysis', working: { ...legacyOpened.sheet.working, user_note: '취소할 글' } } });
const discardPrompt = demoReducer(legacyChanged, { type: 'sheet-close' });
assert.equal(discardPrompt.dialog?.kind, 'discard-draft', 'actual edits must still ask before discarding');
assert.equal(demoReducer(discardPrompt, { type: 'sheet-discard-confirm' }).drafts.new, legacyDraft);
const legacyApplied = preserveAdoptedCaption(legacyOpened, demoReducer(legacyOpened, { type: 'sheet-apply' }));
assert.equal(legacyApplied.drafts.new?.fields.user_note, legacyOpened.sheet.working.user_note);
assert.equal(legacyApplied.drafts.new?.fields.ai_field_note_edited, '');
assert.equal(legacyApplied.drafts.new?.fields.ai_field_note, '생성 원문');
assert.equal(recordWriting(legacyApplied.drafts.new!.fields), recordWriting(legacyFields), 'normalization preserves visible writing exactly');

for (const original of ['', '  직접 쓴 글\n']) {
  const opened = demoReducer({ ...state, save_attempt: null, drafts: { ...state.drafts, new: { ...draft, fields: { ...draft.fields, user_note: original } } } }, { type: 'open-summary-sheet', kind: 'analysis' });
  const pending = demoReducer(opened, { type: 'request-caption' });
  if (pending.sheet?.kind !== 'analysis' || !pending.sheet.caption_request_id) throw new Error('caption request must start');
  const result = acceptCaptionResult(pending, pending.sheet.caption_request_id, draft.input_revision, original, 'success', caption);
  if (result.sheet?.kind !== 'analysis') throw new Error('caption editor must stay open');
  assert.equal(result.sheet.working.user_note, original ? `${original}\n\n${caption}` : caption, 'AI fills empty writing or appends without changing its prefix');
  assert.equal(result.drafts.new, pending.drafts.new, 'generation must leave the draft untouched until apply');
  const applied = preserveAdoptedCaption(result, demoReducer(result, { type: 'sheet-apply' }));
  assert.equal(applied.drafts.new?.fields.ai_field_note, caption);
  assert.equal(recordWriting(applied.drafts.new!.fields), result.sheet.working.user_note, 'generated source must not render twice');
}

for (const length of [1997, 1998]) {
  const original = '𠮷'.repeat(length);
  const pending = demoReducer({ ...adopting, sheet: { ...adopting.sheet, working: { ...writing, user_note: original } } }, { type: 'request-caption' });
  if (pending.sheet?.kind !== 'analysis' || !pending.sheet.caption_request_id) throw new Error('caption request must start');
  const result = acceptCaptionResult(pending, pending.sheet.caption_request_id, draft.input_revision, original, 'success', '빛');
  if (result.sheet?.kind !== 'analysis') throw new Error('caption editor must stay open');
  assert.equal(result.sheet.caption_status, length === 1997 ? 'success' : 'error', 'the total limit counts code points, including the blank line');
  assert.equal(result.sheet.working.user_note, length === 1997 ? `${original}\n\n빛` : original, 'overflow must reject the append without truncating original text');
  assert.equal(result.sheet.caption_suggestion, length === 1997 ? '빛' : caption, 'rejected output must not replace the previously adopted source');
  assert.equal(result.sheet.caption_request_id, null);
}
const failedCaption = acceptCaptionResult(requested, requestId, draft.input_revision, writing.user_note, 'failure');
assert.equal(failedCaption.sheet?.kind === 'analysis' ? failedCaption.sheet.working.user_note : null, writing.user_note, 'generation failure keeps all writing');
assert.equal(failedCaption.sheet?.kind === 'analysis' ? failedCaption.sheet.caption_status : null, 'error');
const replacement = replaceDraftPhoto({ ...draft, fields: { ...draft.fields, diary_date: '2026-09-10', date_source: 'user', place_name: '직접 쓴 장소', user_note: '보존할 통합 글\n\n직접 고친 AI 글', ai_field_note: caption, ai_field_note_edited: '' } }, { ...draft.photo, local_uri: 'new-photo', input_revision: 2 }, '2026-09-11', '2026-09-12');
assert.equal(replacement.input_revision, 2);
assert.equal(replacement.photo.input_revision, 2);
assert.equal(replacement.fields.user_note, '보존할 통합 글\n\n직접 고친 AI 글');
assert.equal(replacement.fields.diary_date, '2026-09-10');
assert.equal(replacement.fields.place_name, '직접 쓴 장소');
assert.equal(replacement.fields.ai_field_note, '', 'a replacement clears AI source metadata while preserving unified writing');
assert.equal(replacement.fields.ai_field_note_edited, null);
const legacyReplacement = replaceDraftPhoto(legacyDraft, { ...draft.photo, input_revision: 2 }, null, '2026-09-12');
assert.equal(legacyReplacement.fields.user_note, recordWriting(legacyFields), 'replacing a photo must also preserve visible legacy writing');
const demoReplacement = demoReducer({ ...legacyApplied, dialog: { kind: 'replace-photo', step: 'discard' } }, { type: 'replace-photo-confirm' });
assert.equal(demoReplacement.drafts.new?.fields.user_note, recordWriting(legacyFields));
assert.equal(demoReplacement.drafts.new?.fields.ai_field_note, '');
const exifReplacement = replaceDraftPhoto(draft, { ...draft.photo, local_uri: 'new-photo', input_revision: 2 }, '2026-09-11', '2026-09-12');
assert.equal(exifReplacement.fields.diary_date, '2026-09-11');
assert.equal(exifReplacement.fields.date_source, 'exif');
assert.equal(demoReducer({ ...state, dialog: { kind: 'replace-photo', step: 'discard' } }, { type: 'replace-photo-cancel' }).drafts.new, state.drafts.new, 'canceling replacement keeps the current draft');
const replacedDuringRequest = { ...requested, drafts: { ...requested.drafts, new: replacement } };
const stalePhotoCaption = acceptCaptionResult(replacedDuringRequest, requestId, draft.input_revision, writing.user_note, 'success', '이전 사진의 AI 글');
assert.equal(stalePhotoCaption.drafts.new?.input_revision, 2);
assert.equal(stalePhotoCaption.drafts.new?.fields.ai_field_note, '', 'an old-photo result must not repopulate the replacement draft');
const leftDraft = demoReducer({ ...stalePhotoCaption, sheet: null }, { type: 'cancel-record' });
const resumedDraft = demoReducer(leftDraft, { type: 'resume-draft', draftId: replacement.draft_id });
assert.equal(resumedDraft.drafts.new?.input_revision, 2, 're-entry keeps the latest photo revision');
assert.equal(resumedDraft.drafts.new?.fields.user_note, '보존할 통합 글\n\n직접 고친 AI 글', 're-entry keeps unified writing');
assert.equal(resumedDraft.drafts.new?.fields.ai_field_note, '', 're-entry keeps the replacement AI field empty');
const out = signedOutState(state);
assert.equal(out.session, null);
assert.deepEqual(out.records, []);
assert.deepEqual(out.drafts, { new: null, edit: null });
assert.equal(acceptSavedRecord(out, 'operation', record), out);
console.log('app-state.check passed: caption races, photo replacement, draft isolation, and save confirmation');
