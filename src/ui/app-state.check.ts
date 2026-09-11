import { acceptCaptionResult, acceptSavedRecord, preserveAdoptedCaption, replaceDraftPhoto, sameSession, signedOutState } from './app-state.ts';
import { demoReducer, initialDemoState } from './demo-state.ts';
import type { DemoRecord } from './contract.ts';

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
const writing = { scene: draft.fields.scene, semantic_tags: draft.fields.semantic_tags, mood_tags: draft.fields.mood_tags, ai_field_note_edited: caption, user_note: '직접 쓴 메모' };
const adopting = { ...state, save_attempt: null, sheet: { kind: 'analysis' as const, initial: writing, working: writing, error: null, caption_status: 'success' as const, caption_suggestion: caption, caption_request_id: null } };
const adopted = preserveAdoptedCaption(adopting, demoReducer(adopting, { type: 'sheet-apply' }));
assert.equal(adopted.drafts.new?.fields.ai_field_note, caption, 'a generated caption keeps its AI source');
assert.equal(adopted.drafts.new?.fields.user_note, '직접 쓴 메모', 'adopting AI writing must preserve the separate user note');
const typing = { ...adopting, sheet: { ...adopting.sheet, working: { ...writing, ai_field_note_edited: '직접 고친 AI 글' } } };
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
  change: { kind: 'analysis', working: { ...requested.sheet.working, ai_field_note_edited: '생성 중 직접 쓴 글', user_note: '생성 중 고친 내 메모' } },
});
const lateCaption = acceptCaptionResult(editedWhileGenerating, requestId, draft.input_revision, caption, 'success', '늦게 도착한 AI 글');
assert.equal(lateCaption.sheet?.kind === 'analysis' ? lateCaption.sheet.working.ai_field_note_edited : null, '생성 중 직접 쓴 글', 'a late caption must not overwrite writing typed while generating');
assert.equal(lateCaption.sheet?.kind === 'analysis' ? lateCaption.sheet.working.user_note : null, '생성 중 고친 내 메모', 'a late caption must not overwrite the separate user note');
assert.equal(lateCaption.sheet?.kind === 'analysis' ? lateCaption.sheet.caption_status : null, 'idle', 'ignored completion must stop the pending state');
const memoOnlyEdit = demoReducer(requested, { type: 'sheet-change', change: { kind: 'analysis', working: { ...requested.sheet.working, user_note: '생성 중 고친 내 메모' } } });
const acceptedCaption = acceptCaptionResult(memoOnlyEdit, requestId, draft.input_revision, caption, 'success', '새 AI 글');
assert.equal(acceptedCaption.sheet?.kind === 'analysis' ? acceptedCaption.sheet.working.ai_field_note_edited : null, '새 AI 글');
assert.equal(acceptedCaption.sheet?.kind === 'analysis' ? acceptedCaption.sheet.working.user_note : null, '생성 중 고친 내 메모');
const replacement = replaceDraftPhoto({ ...draft, fields: { ...draft.fields, diary_date: '2026-09-10', date_source: 'user', place_name: '직접 쓴 장소', user_note: '보존할 내 메모', ai_field_note: caption, ai_field_note_edited: '직접 고친 AI 글' } }, { ...draft.photo, local_uri: 'new-photo', input_revision: 2 }, '2026-09-11', '2026-09-12');
assert.equal(replacement.input_revision, 2);
assert.equal(replacement.photo.input_revision, 2);
assert.equal(replacement.fields.user_note, '보존할 내 메모');
assert.equal(replacement.fields.diary_date, '2026-09-10');
assert.equal(replacement.fields.place_name, '직접 쓴 장소');
assert.equal(replacement.fields.ai_field_note, '', 'a replacement must not keep writing from the previous photo');
assert.equal(replacement.fields.ai_field_note_edited, null);
const exifReplacement = replaceDraftPhoto(draft, { ...draft.photo, local_uri: 'new-photo', input_revision: 2 }, '2026-09-11', '2026-09-12');
assert.equal(exifReplacement.fields.diary_date, '2026-09-11');
assert.equal(exifReplacement.fields.date_source, 'exif');
assert.equal(demoReducer({ ...state, dialog: { kind: 'replace-photo', step: 'discard' } }, { type: 'replace-photo-cancel' }).drafts.new, state.drafts.new, 'canceling replacement keeps the current draft');
const replacedDuringRequest = { ...requested, drafts: { ...requested.drafts, new: replacement } };
const stalePhotoCaption = acceptCaptionResult(replacedDuringRequest, requestId, draft.input_revision, caption, 'success', '이전 사진의 AI 글');
assert.equal(stalePhotoCaption.drafts.new?.input_revision, 2);
assert.equal(stalePhotoCaption.drafts.new?.fields.ai_field_note, '', 'an old-photo result must not repopulate the replacement draft');
const leftDraft = demoReducer({ ...stalePhotoCaption, sheet: null }, { type: 'cancel-record' });
const resumedDraft = demoReducer(leftDraft, { type: 'resume-draft', draftId: replacement.draft_id });
assert.equal(resumedDraft.drafts.new?.input_revision, 2, 're-entry keeps the latest photo revision');
assert.equal(resumedDraft.drafts.new?.fields.user_note, '보존할 내 메모', 're-entry keeps the separate user note');
assert.equal(resumedDraft.drafts.new?.fields.ai_field_note, '', 're-entry keeps the replacement AI field empty');
const out = signedOutState(state);
assert.equal(out.session, null);
assert.deepEqual(out.records, []);
assert.deepEqual(out.drafts, { new: null, edit: null });
assert.equal(acceptSavedRecord(out, 'operation', record), out);
console.log('app-state.check passed: caption races, photo replacement, draft isolation, and save confirmation');
