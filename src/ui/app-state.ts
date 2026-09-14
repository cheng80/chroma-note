import { listDrafts, putDraft, removeDraft } from '../domain/draft-collection.ts';
import { currentDraft, demoReducer, filterRecords, initialDemoState } from './demo-state.ts';
import type { DemoRecord, DemoState, Draft, PhotoInput } from './contract.ts';
import { recordWriting } from './record-writing.ts';

export function bookState(state: DemoState): DemoState {
  const filtered = filterRecords(state.records, state.book_filter);
  return { ...state, book_state: filtered.length ? 'ready' : Object.values(state.book_filter).some(Boolean) ? 'filter-empty' : 'empty' };
}

export function signedOutState(state: DemoState): DemoState {
  return { ...initialDemoState(), locale: state.locale, locale_preference: state.locale_preference, model_status: 'unprepared' };
}

/** Preserve the latest generated text as the AI source when applying the unified editor. */
export function preserveAdoptedCaption(before: DemoState, after: DemoState): DemoState {
  const sheet = before.sheet;
  const kind = before.active_draft_kind;
  if (!kind || after.sheet || sheet?.kind !== 'analysis' || !sheet.caption_suggestion) return after;
  const draft = currentDraft(after);
  if (!draft) return after;
  return { ...after, drafts: putDraft(after.drafts, { ...draft, fields: { ...draft.fields, ai_field_note: sheet.caption_suggestion } }) };
}

/** Append a completed caption to the latest writing while preserving request and input identity. */
export function acceptCaptionResult(state: DemoState, requestId: string, inputRevision: number, outcome: 'success' | 'failure', value?: string): DemoState {
  const sheet = state.sheet;
  const draft = state.active_draft_kind ? currentDraft(state) : null;
  if (sheet?.kind !== 'analysis' || sheet.caption_status !== 'pending' || sheet.caption_request_id !== requestId || draft?.input_revision !== inputRevision) return state;
  return outcome === 'success' && value
    ? demoReducer(state, { type: 'caption-result', requestId, inputRevision, outcome, value })
    : demoReducer(state, { type: 'caption-result', requestId, inputRevision, outcome: 'failure' });
}

export function replaceDraftPhoto(draft: Draft, photo: PhotoInput, capturedDate: string | null, deviceDate: string): Draft {
  const userDate = draft.fields.date_source === 'user';
  return {
    ...draft,
    input_revision: photo.input_revision,
    photo,
    stage: 'photo_ready',
    colors: null,
    analysis: null,
    selected_candidate: null,
    pending_candidate: null,
    confirmation: null,
    fields: {
      ...draft.fields,
      user_note: recordWriting(draft.fields),
      diary_date: userDate ? draft.fields.diary_date : capturedDate ?? deviceDate,
      date_source: userDate ? 'user' : capturedDate ? 'exif' : 'device',
      scene: null,
      semantic_tags: [],
      mood_tags: [],
      ai_field_note: '',
      ai_field_note_edited: null,
    },
    error_code: undefined,
  };
}

/** A late response from another session must never repopulate this account's UI. */
export function sameSession(state: DemoState, owner: string, generation: number) {
  return state.session?.owner_id === owner && state.session.generation === generation;
}

export function acceptSavedRecord(state: DemoState, operationId: string, record: DemoRecord): DemoState {
  const attempt = state.save_attempt;
  if (!attempt || attempt.operation_id !== operationId || attempt.owner_id !== state.session?.owner_id || record.user_id !== attempt.owner_id || record.id !== attempt.record_id || record.status !== 'ready') return state;
  const draft = listDrafts(state.drafts).find(item => item.draft_id === attempt.draft_id);
  if (!draft) return state;
  const editingSavedDraft = state.active_draft_kind !== null && currentDraft(state)?.draft_id === draft.draft_id;
  return bookState({ ...state, ...(editingSavedDraft ? { route: 'book' as const, active_draft_kind: null, selected_record_id: null, sheet: null, dialog: null } : {}),
    records: [record, ...state.records.filter(item => item.id !== record.id)], drafts: removeDraft(state.drafts, draft), save_attempt: { ...attempt, state: 'saved' } });
}
