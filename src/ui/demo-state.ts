import {
  DEMO_CODE,
  DEMO_IMAGE_HEIGHT,
  DEMO_IMAGE_WIDTH,
  type Analysis,
  type BookFilter,
  type DemoRecord,
  type DemoScenario,
  type DemoState,
  type Draft,
  type DraftKind,
  type RecordFields,
  type SaveAttempt,
  type SavePayloadSnapshot,
  type SheetChange,
  type StampCandidate,
} from './contract.ts';

export { DEMO_CODE };

export const DEMO_PHOTO_URI = 'demo-photo';
export const DEMO_STAMP_URI = 'demo-stamp';

export function displayLocale(preference: 'system' | 'ko' | 'en', systemLocale = Intl.DateTimeFormat().resolvedOptions().locale) {
  return preference === 'system' ? systemLocale.toLowerCase().startsWith('ko') ? 'ko' : 'en' : preference;
}

export type DemoAction =
  | { type: 'email'; value: string }
  | { type: 'submit-email' }
  | { type: 'code'; value: string }
  | { type: 'verify' }
  | { type: 'resend' }
  | { type: 'back-email' }
  | { type: 'start-record' }
  | { type: 'use-photo' }
  | { type: 'continue-photo' }
  | { type: 'resume-draft'; draftId: string }
  | { type: 'tick-processing'; jobId: string; inputRevision: number }
  | { type: 'retry-processing' }
  | { type: 'skip-analysis' }
  | { type: 'cancel-record' }
  | { type: 'replace-photo' }
  | { type: 'replace-photo-confirm' }
  | { type: 'replace-photo-cancel' }
  | { type: 'open-original' }
  | { type: 'close-image' }
  | { type: 'compare-tab'; value: 'photo' | 'stamp' }
  | { type: 'confirm'; value: boolean }
  | { type: 'continue-compare' }
  | { type: 'regenerate' }
  | { type: 'adopt-request'; candidateId: string }
  | { type: 'adopt-confirm'; candidateId: string }
  | { type: 'adopt-cancel' }
  | { type: 'open-summary-sheet'; kind: 'datePlace' | 'analysis' | 'colors' }
  | { type: 'sheet-change'; change: SheetChange }
  | { type: 'sheet-apply' }
  | { type: 'sheet-cancel' }
  | { type: 'sheet-close' }
  | { type: 'sheet-discard-confirm' }
  | { type: 'sheet-discard-cancel' }
  | { type: 'request-caption' }
  | { type: 'caption-result'; requestId: string; inputRevision: number; outcome: 'success'; value: string }
  | { type: 'caption-result'; requestId: string; inputRevision: number; outcome: 'failure' }
  | { type: 'save' }
  | { type: 'save-result'; operationId: string; outcome: 'success' | 'failed' | 'uncertain' | 'conflict' }
  | { type: 'retry-save' }
  | { type: 'open-detail'; recordId: string }
  | { type: 'back-book' }
  | { type: 'summary-back' }
  | { type: 'open-read' }
  | { type: 'open-actions' }
  | { type: 'edit-record' }
  | { type: 'request-delete-record' }
  | { type: 'delete-confirm' }
  | { type: 'delete-cancel' }
  | { type: 'toggle-favorite'; recordId: string }
  | { type: 'retry-image' }
  | { type: 'open-filter' }
  | { type: 'load-more' }
  | { type: 'retry-book' }
  | { type: 'open-settings' }
  | { type: 'back-settings' }
  | { type: 'locale'; value: 'system' | 'ko' | 'en'; systemLocale?: string }
  | { type: 'scenario'; value: DemoScenario }
  | { type: 'logout' }
  | { type: 'logout-confirm' }
  | { type: 'logout-cancel' }
  | { type: 'delete-account-request' }
  | { type: 'delete-account-cancel' }
  | { type: 'delete-account-result'; outcome: 'success' | 'failed' };

let idSequence = 0;
function nextId(prefix: string) {
  idSequence += 1;
  return `${prefix}-${Date.now()}-${idSequence}`;
}

const emptyFilter = (): BookFilter => ({ start_date: null, end_date: null, semantic_tag: null, favorite_only: false });

function initialFields(): RecordFields {
  const now = new Date();
  const diary_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { diary_date, date_source: 'device', place_name: null, user_note: '', scene: null, semantic_tags: [], mood_tags: [], ai_field_note: '', ai_field_note_edited: null, is_favorite: false };
}

function demoPhoto(): Draft['photo'] {
  return { local_uri: DEMO_PHOTO_URI, width: DEMO_IMAGE_WIDTH, height: DEMO_IMAGE_HEIGHT, input_revision: 1, source: 'demo' };
}

function demoCandidate(revision: number, suffix = 'a'): StampCandidate {
  return { candidate_id: nextId(`candidate-${revision}-${suffix}`), input_revision: revision, local_uri: DEMO_STAMP_URI, width: DEMO_IMAGE_WIDTH, height: DEMO_IMAGE_HEIGHT, source: 'demo' };
}

function makeDraft(kind: DraftKind, record?: DemoRecord): Draft {
  if (record) return { draft_id: `edit-${record.id}`, owner_id: record.user_id, record_id: record.id, kind: 'edit', input_revision: record.stamp.input_revision, stage: 'summary', photo: { local_uri: DEMO_PHOTO_URI, width: DEMO_IMAGE_WIDTH, height: DEMO_IMAGE_HEIGHT, input_revision: record.stamp.input_revision, source: 'demo' }, colors: { source: 'demo', source_revision: record.stamp.input_revision, tags: record.color_tags }, analysis: null, selected_candidate: record.stamp, confirmation: { input_revision: record.stamp.input_revision, candidate_id: record.stamp.candidate_id }, fields: { ...record.fields, semantic_tags: [...record.fields.semantic_tags], mood_tags: [...record.fields.mood_tags] }, base_record_version: record.version };
  return { draft_id: nextId('new-draft'), owner_id: 'demo-a', record_id: nextId('record'), kind, input_revision: 1, stage: 'photo_ready', photo: demoPhoto(), colors: null, analysis: null, selected_candidate: null, confirmation: null, fields: initialFields() };
}

export function initialDemoState(systemLocale?: string): DemoState {
  return { route: 'email', locale_preference: 'system', locale: displayLocale('system', systemLocale), scenario: 'normal', email: '', code: '', auth: { request_id: null, email: '', status: 'idle' }, session: null, model_status: 'unprepared', records: [], drafts: { new: null, edit: null }, active_draft_kind: null, selected_record_id: null, book_filter: emptyFilter(), book_state: 'empty', page_size: 6, comparison_tab: 'photo', active_job: null, sheet: null, dialog: null, save_attempt: null, account_deletion: 'idle' };
}

function withBookState(state: DemoState): DemoState {
  if (state.scenario === 'book-error') return { ...state, book_state: 'error' };
  if (state.scenario === 'empty-book') return { ...state, book_state: 'empty' };
  const filtered = filterRecords(state.records, state.book_filter);
  return { ...state, book_state: filtered.length ? state.scenario === 'partial-cache' ? 'partial-cache' : 'ready' : state.book_filter.semantic_tag || state.book_filter.favorite_only || state.book_filter.start_date || state.book_filter.end_date ? 'filter-empty' : 'empty' };
}

export function filterRecords(records: DemoRecord[], filter: BookFilter) {
  return records.filter((record) => (!filter.start_date || record.fields.diary_date >= filter.start_date) && (!filter.end_date || record.fields.diary_date <= filter.end_date) && (!filter.semantic_tag || [...record.fields.semantic_tags, ...record.fields.mood_tags].includes(filter.semantic_tag)) && (!filter.favorite_only || record.fields.is_favorite));
}

function currentDraft(state: DemoState): Draft | null {
  return (state.active_draft_kind && state.drafts[state.active_draft_kind]) || state.drafts.new || state.drafts.edit;
}

function setDraft(state: DemoState, draft: Draft): DemoState {
  return { ...state, drafts: { ...state.drafts, [draft.kind]: draft }, active_draft_kind: draft.kind };
}

function resetAfterPhotoChange(draft: Draft): Draft {
  const revision = draft.input_revision + 1;
  return { ...draft, input_revision: revision, photo: { ...draft.photo, input_revision: revision }, stage: 'photo_ready', colors: null, analysis: null, selected_candidate: null, confirmation: null, error_code: undefined };
}

function baseAnalysis(revision: number): Analysis {
  return { source: 'demo', source_revision: revision, status: 'success', scene: '늦은 오후의 산책', semantic_tags: ['산책'], mood: ['차분함'], ai_field_note: '', ai_field_note_edited: null, user_modified_fields: [] };
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidFilter(filter: BookFilter) {
  return (!filter.start_date || isCalendarDate(filter.start_date)) && (!filter.end_date || isCalendarDate(filter.end_date)) && (!filter.start_date || !filter.end_date || filter.start_date <= filter.end_date);
}

function isValidText(value: string, maximum: number) {
  return value === value.normalize('NFC') && [...value].length <= maximum;
}

function isValidTags(values: string[], maximum: number) {
  return values.length <= maximum && values.every((value) => value.trim() && isValidText(value, 24)) && new Set(values).size === values.length;
}

function isValidAnalysisFields(fields: RecordFields) {
  return (fields.scene === null || isValidText(fields.scene, 120)) && isValidTags(fields.semantic_tags, 8) && isValidTags(fields.mood_tags, 3) && (fields.ai_field_note_edited === null || isValidText(fields.ai_field_note_edited, 300));
}

function isSaveableDraft(draft: Draft | null) {
  const candidate = draft?.selected_candidate;
  const confirmation = draft?.confirmation;
  return Boolean(draft && candidate && candidate.input_revision === draft.input_revision && confirmation && confirmation.input_revision === draft.input_revision && confirmation.candidate_id === candidate.candidate_id && draft.colors?.source_revision === draft.input_revision && isCalendarDate(draft.fields.diary_date) && isValidText(draft.fields.user_note, 2000) && (draft.fields.place_name === null || isValidText(draft.fields.place_name, 120)) && isValidAnalysisFields(draft.fields));
}

function snapshotFor(draft: Draft): SavePayloadSnapshot {
  return { stamp: draft.selected_candidate as StampCandidate, color_tags: draft.colors?.tags.map((tag) => ({ ...tag, rgb: [...tag.rgb] as [number, number, number] })) ?? [], confirmation: draft.confirmation ? { ...draft.confirmation } : null, fields: { ...draft.fields, semantic_tags: [...draft.fields.semantic_tags], mood_tags: [...draft.fields.mood_tags] }, ...(draft.analysis ? { analysis: { ...draft.analysis, semantic_tags: [...draft.analysis.semantic_tags], mood: [...draft.analysis.mood], user_modified_fields: [...draft.analysis.user_modified_fields] } } : {}), input_dimensions: [draft.photo.width, draft.photo.height] };
}

function sheetDirty(state: DemoState) {
  const sheet = state.sheet;
  return Boolean(sheet && 'working' in sheet && JSON.stringify(sheet.initial) !== JSON.stringify(sheet.working));
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'email': return { ...state, email: action.value, auth: { ...state.auth, error_code: undefined } };
    case 'submit-email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim()) ? { ...state, route: 'otp', code: '', auth: { request_id: nextId('request'), email: state.email.trim(), status: 'success' } } : { ...state, auth: { ...state.auth, status: 'error', error_code: 'email_invalid' } };
    case 'code': return { ...state, code: action.value, auth: { ...state.auth, error_code: undefined } };
    case 'verify': return state.code === DEMO_CODE ? { ...state, route: 'book', session: { source: 'demo', owner_id: 'demo-a', generation: 1, email: state.email.trim(), locale: state.locale }, auth: { ...state.auth, status: 'success', error_code: undefined }, book_state: state.records.length ? 'ready' : 'empty' } : { ...state, auth: { ...state.auth, status: 'error', error_code: 'otp_invalid' } };
    case 'resend': return { ...state, code: '', auth: { ...state.auth, status: 'success', request_id: nextId('request'), error_code: undefined } };
    case 'back-email': return { ...state, route: 'email', code: '', auth: { ...state.auth, status: 'idle', error_code: undefined } };
    case 'start-record': return state.drafts.new ? { ...state, route: 'photo', active_draft_kind: 'new', selected_record_id: null, sheet: null } : setDraft({ ...state, route: 'photo', selected_record_id: null, sheet: null }, makeDraft('new'));
    case 'use-photo': return state.drafts.new ? { ...state, route: 'photo', active_draft_kind: 'new' } : setDraft({ ...state, route: 'photo' }, makeDraft('new'));
    case 'continue-photo': return state.drafts.new ? { ...state, route: 'processing', active_draft_kind: 'new', model_status: 'preparing', active_job: { job_id: nextId('job'), owner_id: state.session?.owner_id ?? 'demo-a', generation: state.session?.generation ?? 1, input_revision: state.drafts.new.input_revision, step: 'prepare', status: 'running' }, drafts: { ...state.drafts, new: { ...state.drafts.new, stage: 'preparing', error_code: undefined } } } : state;
    case 'resume-draft': {
      let source = state;
      let draft = Object.values(state.drafts).find((item) => item?.draft_id === action.draftId);
      if (!draft) return state;
      if (state.save_attempt?.state === 'failed' && state.save_attempt.draft_id === draft.draft_id) {
        draft = { ...draft, stage: 'summary', operation_id: undefined };
        source = { ...state, save_attempt: null, drafts: { ...state.drafts, [draft.kind]: draft } };
      }
      if (draft.kind === 'edit') return { ...source, route: 'summary', active_draft_kind: 'edit', selected_record_id: draft.record_id, sheet: null, dialog: null };
      const route = draft.stage === 'photo_ready' ? 'photo' : draft.stage === 'compare' ? 'compare' : draft.stage === 'summary' || draft.stage === 'save_pending' ? 'summary' : 'processing';
      const needsJob = route === 'processing' && (!source.active_job || source.active_job.input_revision !== draft.input_revision);
      return { ...source, route, active_draft_kind: 'new', selected_record_id: null, sheet: null, dialog: null, active_job: needsJob ? { job_id: nextId('job'), owner_id: draft.owner_id, generation: source.session?.generation ?? 1, input_revision: draft.input_revision, step: 'prepare', status: 'running' } : source.active_job };
    }
    case 'tick-processing': {
      const draft = state.drafts.new;
      const job = state.active_job;
      if (!draft || !job || job.job_id !== action.jobId || job.input_revision !== action.inputRevision || draft.input_revision !== action.inputRevision || job.status !== 'running') return state;
      const fail = (code: Draft['error_code']): DemoState => ({ ...state, active_job: { ...job, status: 'failed', error_code: code }, drafts: { ...state.drafts, new: { ...draft, stage: 'interrupted', error_code: code } }, model_status: code === 'prepare_failed' ? 'failed' : state.model_status });
      if (job.step === 'prepare' && state.scenario === 'prepare-failed') return fail('prepare_failed');
      if (job.step === 'colors' && state.scenario === 'color-failed') return fail('color_failed');
      if (job.step === 'analysis' && state.scenario === 'analysis-failed') return fail('analysis_failed');
      if (job.step === 'stamp' && state.scenario === 'stamp-failed') return fail('stamp_failed');
      if (job.step === 'prepare') return { ...state, model_status: 'ready', active_job: { ...job, step: 'colors' }, drafts: { ...state.drafts, new: { ...draft, stage: 'colors', error_code: undefined } } };
      if (job.step === 'colors') return { ...state, active_job: { ...job, step: 'analysis' }, drafts: { ...state.drafts, new: { ...draft, stage: 'analysis', colors: { source: 'demo', source_revision: draft.input_revision, tags: [{ hex: '#294B63', rgb: [41, 75, 99], weight: 0.58 }, { hex: '#D9A66A', rgb: [217, 166, 106], weight: 0.42 }] }, error_code: undefined } } };
      if (job.step === 'analysis') { const analysis = baseAnalysis(draft.input_revision); return { ...state, active_job: { ...job, step: 'stamp' }, drafts: { ...state.drafts, new: { ...draft, stage: 'stamp', analysis, fields: { ...draft.fields, scene: analysis.scene, semantic_tags: [...analysis.semantic_tags], mood_tags: [...analysis.mood], ai_field_note: '', ai_field_note_edited: null }, error_code: undefined } } }; }
      const candidate = demoCandidate(draft.input_revision);
      return { ...state, route: 'compare', active_job: null, drafts: { ...state.drafts, new: { ...draft, stage: 'compare', selected_candidate: candidate, confirmation: null, error_code: undefined } } };
    }
    case 'retry-processing': return state.drafts.new ? { ...state, active_job: { ...(state.active_job ?? { job_id: nextId('job'), owner_id: state.session?.owner_id ?? 'demo-a', generation: state.session?.generation ?? 1, input_revision: state.drafts.new.input_revision, step: 'prepare' }), status: 'running', error_code: undefined, step: 'prepare' }, route: 'processing', active_draft_kind: 'new', model_status: 'preparing', drafts: { ...state.drafts, new: { ...state.drafts.new, stage: 'preparing', error_code: undefined } } } : state;
    case 'skip-analysis': return state.drafts.new && state.active_job ? { ...state, active_job: { ...state.active_job, step: 'stamp', status: 'running' }, drafts: { ...state.drafts, new: { ...state.drafts.new, stage: 'stamp', analysis: { ...baseAnalysis(state.drafts.new.input_revision), status: 'skipped', scene: null, semantic_tags: [], mood: [], ai_field_note: '', ai_field_note_edited: null } } } } : state;
    case 'cancel-record': return { ...state, route: 'book', active_job: null, active_draft_kind: null, selected_record_id: null, sheet: null, dialog: null };
    case 'replace-photo': return currentDraft(state) ? { ...state, dialog: { kind: 'replace-photo', step: 'discard' } } : state;
    case 'replace-photo-confirm': { const draft = currentDraft(state); return draft ? setDraft({ ...state, route: 'photo', dialog: null, active_job: null }, resetAfterPhotoChange(draft)) : state; }
    case 'replace-photo-cancel': return { ...state, dialog: null };
    case 'open-original': return { ...state, route: 'image' };
    case 'close-image': return { ...state, route: state.active_draft_kind === 'new' && state.drafts.new?.stage === 'compare' ? 'compare' : state.route === 'image' ? 'detail' : 'book' };
    case 'compare-tab': return { ...state, comparison_tab: action.value };
    case 'confirm': { const draft = state.drafts.new; if (!draft?.selected_candidate || draft.selected_candidate.input_revision !== draft.input_revision) return state; return { ...state, drafts: { ...state.drafts, new: { ...draft, confirmation: action.value ? { input_revision: draft.input_revision, candidate_id: draft.selected_candidate.candidate_id } : null } } }; }
    case 'continue-compare': { const draft = state.drafts.new; const confirmed = Boolean(draft?.selected_candidate && draft.selected_candidate.input_revision === draft.input_revision && draft.confirmation && draft.confirmation.candidate_id === draft.selected_candidate.candidate_id && draft.confirmation.input_revision === draft.input_revision); return confirmed && draft ? { ...state, route: 'summary', active_draft_kind: 'new', drafts: { ...state.drafts, new: { ...draft, stage: 'summary' } } } : state; }
    case 'open-summary-sheet': { const draft = currentDraft(state); if (!draft) return state; if (action.kind === 'datePlace') return { ...state, sheet: { kind: 'datePlace', initial: { diary_date: draft.fields.diary_date, date_source: draft.fields.date_source, place_name: draft.fields.place_name }, working: { diary_date: draft.fields.diary_date, date_source: draft.fields.date_source, place_name: draft.fields.place_name }, error: null } }; if (action.kind === 'analysis') { const working = { scene: draft.fields.scene, semantic_tags: [...draft.fields.semantic_tags], mood_tags: [...draft.fields.mood_tags], ai_field_note_edited: draft.fields.ai_field_note_edited, user_note: draft.fields.user_note }; return { ...state, sheet: { kind: 'analysis', initial: working, working, error: null, caption_status: 'idle', caption_suggestion: null, caption_request_id: null } }; } return draft.colors ? { ...state, sheet: { kind: 'colors', value: draft.colors } } : state; }
    case 'sheet-change': {
      const sheet = state.sheet;
      if (!sheet || sheet.kind !== action.change.kind) return state;
      return { ...state, sheet: { ...sheet, working: action.change.working, error: null } as DemoState['sheet'] };
    }
    case 'sheet-apply': { const draft = currentDraft(state); const sheet = state.sheet; if (!sheet) return state; if (sheet.kind === 'filter') return isValidFilter(sheet.working) ? withBookState({ ...state, book_filter: sheet.working, sheet: null }) : { ...state, sheet: { ...sheet, error: 'date-range-invalid' } }; if (!draft || sheet.kind === 'colors' || sheet.kind === 'read' || sheet.kind === 'actions') return { ...state, sheet: null }; if (sheet.kind === 'datePlace' && (!isCalendarDate(sheet.working.diary_date) || (sheet.working.place_name !== null && !isValidText(sheet.working.place_name, 120)))) return { ...state, sheet: { ...sheet, error: 'date-or-place-invalid' } }; if (sheet.kind === 'analysis' && (!isValidText(sheet.working.user_note, 2000) || !isValidAnalysisFields({ ...draft.fields, ...sheet.working }))) return { ...state, sheet: { ...sheet, error: 'analysis-invalid' } }; const fields = sheet.kind === 'datePlace' ? { ...draft.fields, ...sheet.working } : { ...draft.fields, scene: sheet.working.scene, semantic_tags: [...sheet.working.semantic_tags], mood_tags: [...sheet.working.mood_tags], ai_field_note_edited: sheet.working.ai_field_note_edited, user_note: sheet.working.user_note }; return { ...state, sheet: null, drafts: { ...state.drafts, [draft.kind]: { ...draft, fields } } }; }
    case 'sheet-cancel': return { ...state, sheet: null };
    case 'sheet-close': return sheetDirty(state) ? { ...state, dialog: { kind: 'discard-draft' } } : { ...state, sheet: null };
    case 'sheet-discard-confirm': return { ...state, sheet: null, dialog: null };
    case 'sheet-discard-cancel': return { ...state, dialog: null };
    case 'request-caption': return state.sheet?.kind === 'analysis' && state.sheet.caption_status !== 'pending' && currentDraft(state) ? { ...state, sheet: { ...state.sheet, caption_status: 'pending', caption_request_id: nextId('caption') } } : state;
    case 'caption-result': {
      const sheet = state.sheet;
      if (sheet?.kind !== 'analysis' || sheet.caption_status !== 'pending' || sheet.caption_request_id !== action.requestId || currentDraft(state)?.input_revision !== action.inputRevision) return state;
      if (action.outcome === 'failure' || !action.value || action.value.length > 300) return { ...state, sheet: { ...sheet, caption_status: 'error', caption_request_id: null } };
      return { ...state, sheet: { ...sheet, working: { ...sheet.working, ai_field_note_edited: action.value }, caption_status: 'success', caption_suggestion: action.value, caption_request_id: null } };
    }
    case 'save': { const draft = currentDraft(state); if (!draft || !isSaveableDraft(draft) || state.save_attempt?.state === 'pending') return state; const operationId = nextId('operation'); const attempt: SaveAttempt = { operation_id: operationId, draft_id: draft.draft_id, record_id: draft.record_id, owner_id: state.session?.owner_id ?? draft.owner_id, base_version: draft.base_record_version, payload_snapshot: snapshotFor(draft), state: 'pending' }; return { ...state, save_attempt: attempt, drafts: { ...state.drafts, [draft.kind]: { ...draft, stage: 'save_pending', operation_id: operationId } } }; }
    case 'save-result': { const attempt = state.save_attempt; const draft = attempt ? Object.values(state.drafts).find((item) => item?.draft_id === attempt.draft_id) : null; if (!attempt || !draft || attempt.operation_id !== action.operationId || attempt.state !== 'pending') return state; if (action.outcome !== 'success') return { ...state, save_attempt: { ...attempt, state: action.outcome } }; const snapshot = attempt.payload_snapshot; const existing = state.records.find((item) => item.id === attempt.record_id); const record: DemoRecord = { source: 'demo', id: attempt.record_id, user_id: attempt.owner_id, status: 'ready', version: (existing?.version ?? 0) + 1, stamp: { ...snapshot.stamp }, color_tags: snapshot.color_tags.map((tag) => ({ ...tag, rgb: [...tag.rgb] as [number, number, number] })), fields: { ...snapshot.fields, semantic_tags: [...snapshot.fields.semantic_tags], mood_tags: [...snapshot.fields.mood_tags] }, created_at: existing?.created_at ?? new Date().toISOString() }; const records = existing ? state.records.map((item) => item.id === record.id ? record : item) : [...state.records, record]; return withBookState({ ...state, route: 'book', records, drafts: { ...state.drafts, [draft.kind]: null }, active_draft_kind: null, selected_record_id: null, save_attempt: { ...attempt, state: 'demo_saved' }, sheet: null }); }
    case 'retry-save': return state.save_attempt && state.save_attempt.state !== 'pending' && state.save_attempt.state !== 'demo_saved' ? { ...state, scenario: state.scenario === 'save-failed' || state.scenario === 'save-uncertain' || state.scenario === 'save-conflict' ? 'normal' : state.scenario, save_attempt: { ...state.save_attempt, state: 'pending', error_code: undefined } } : state;
    case 'open-detail': return state.records.some((record) => record.id === action.recordId) ? { ...state, route: 'detail', selected_record_id: action.recordId, active_draft_kind: null, sheet: null } : state;
    case 'back-book': return { ...state, route: 'book', selected_record_id: null, active_draft_kind: null, sheet: null };
    case 'summary-back': { const draft = currentDraft(state); return draft?.kind === 'new' ? { ...state, route: 'compare', active_draft_kind: 'new', sheet: null } : draft?.kind === 'edit' ? { ...state, route: 'detail', active_draft_kind: 'edit', selected_record_id: draft.record_id, sheet: null } : { ...state, route: 'book', active_draft_kind: null, sheet: null }; }
    case 'open-read': return state.selected_record_id ? { ...state, sheet: { kind: 'read', record_id: state.selected_record_id } } : state;
    case 'open-actions': return state.selected_record_id ? { ...state, sheet: { kind: 'actions', record_id: state.selected_record_id } } : state;
    case 'edit-record': { const record = state.records.find((item) => item.id === state.selected_record_id); return record ? { ...state, route: 'summary', sheet: null, active_draft_kind: 'edit', drafts: { ...state.drafts, edit: makeDraft('edit', record) } } : state; }
    case 'request-delete-record': return { ...state, dialog: state.selected_record_id ? { kind: 'delete-record', record_id: state.selected_record_id } : null, sheet: null };
    case 'delete-confirm': { const id = state.selected_record_id; return id ? withBookState({ ...state, route: 'book', selected_record_id: null, dialog: null, records: state.records.filter((record) => record.id !== id) }) : state; }
    case 'delete-cancel': return { ...state, dialog: null };
    case 'toggle-favorite': { const records = state.records.map((record) => record.id === action.recordId ? { ...record, fields: { ...record.fields, is_favorite: !record.fields.is_favorite } } : record); return withBookState({ ...state, records }); }
    case 'retry-image': return { ...state, scenario: 'normal' };
    case 'open-filter': return { ...state, sheet: { kind: 'filter', initial: state.book_filter, working: { ...state.book_filter }, error: null } };
    case 'load-more': return { ...state, page_size: state.page_size + 6 };
    case 'retry-book': return withBookState({ ...state, scenario: 'normal' });
    case 'open-settings': return { ...state, route: 'settings', sheet: null };
    case 'back-settings': return { ...state, route: 'book' };
    case 'locale': { const locale = displayLocale(action.value, action.systemLocale); return { ...state, locale_preference: action.value, locale, session: state.session ? { ...state.session, locale } : state.session }; }
    case 'scenario': return withBookState({ ...state, scenario: action.value });
    case 'logout': return state.drafts.new || state.drafts.edit ? { ...state, dialog: { kind: 'logout', step: 'discard' } } : { ...initialDemoState(), locale_preference: state.locale_preference, locale: state.locale };
    case 'logout-confirm': return { ...initialDemoState(), locale_preference: state.locale_preference, locale: state.locale };
    case 'logout-cancel': return { ...state, dialog: null };
    case 'delete-account-request': return { ...state, dialog: { kind: 'delete-account' } };
    case 'delete-account-cancel': return { ...state, dialog: null };
    case 'delete-account-result': return action.outcome === 'success' ? { ...initialDemoState(), locale_preference: state.locale_preference, locale: state.locale } : { ...state, dialog: null, account_deletion: 'failed' };
    default: return state;
  }
}

export function assertDemoInvariants(state: DemoState) {
  for (const draft of Object.values(state.drafts)) if (draft?.confirmation && (!draft.selected_candidate || draft.confirmation.input_revision !== draft.input_revision || draft.confirmation.candidate_id !== draft.selected_candidate.candidate_id || draft.selected_candidate.input_revision !== draft.input_revision)) throw new Error('confirmation must match the selected candidate and input revision');
  if (state.active_draft_kind && !state.drafts[state.active_draft_kind]) throw new Error('active draft must exist');
  if (!state.session && !['email', 'otp'].includes(state.route)) throw new Error('protected routes require a demo session');
  if (state.save_attempt?.state === 'pending' && !Object.values(state.drafts).some((draft) => draft?.draft_id === state.save_attempt?.draft_id)) throw new Error('pending save must retain its draft');
  if (state.save_attempt?.state === 'demo_saved' && state.records.filter((record) => record.id === state.save_attempt?.record_id).length !== 1) throw new Error('a saved operation must converge to one record');
}
