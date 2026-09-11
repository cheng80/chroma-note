import type { ActiveJob, Analysis, ColorResult, DemoErrorCode, DemoState, ProcessStep, StampCandidate } from './contract.ts';

export type PhotoStepResult =
  | { step: 'prepare' }
  | { step: 'colors'; colors: ColorResult }
  | { step: 'analysis'; analysis: Analysis }
  | { step: 'stamp'; stamp: StampCandidate };

export function currentPhotoJob(state: DemoState, job: ActiveJob) {
  const draft = state.drafts.new;
  return Boolean(draft?.photo.source === 'device' && state.session?.owner_id === job.owner_id
    && state.session.generation === job.generation && draft.owner_id === job.owner_id
    && draft.input_revision === job.input_revision && state.active_job?.job_id === job.job_id
    && state.active_job.step === job.step && state.active_job.status === 'running');
}

/** Resume at the first unfinished step, never generate another result for a completed photo. */
export function beginPhotoProcessing(state: DemoState, jobId: string): DemoState {
  const draft = state.drafts.new;
  const session = state.session;
  if (!draft || draft.photo.source !== 'device' || !session || draft.owner_id !== session.owner_id) return state;
  const revision = draft.input_revision;
  if (draft.selected_candidate?.input_revision === revision && draft.colors?.source_revision === revision && draft.analysis?.source_revision === revision) {
    return { ...state, route: 'compare', active_draft_kind: 'new', active_job: null, drafts: { ...state.drafts, new: { ...draft, stage: 'compare', error_code: undefined } } };
  }
  const step: ProcessStep = state.model_status !== 'ready' ? 'prepare' : draft.colors?.source_revision !== revision ? 'colors' : draft.analysis?.source_revision !== revision ? 'analysis' : 'stamp';
  return { ...state, route: 'processing', active_draft_kind: 'new', sheet: null, dialog: null,
    model_status: step === 'prepare' ? 'preparing' : state.model_status, active_job: { job_id: jobId, owner_id: session.owner_id, generation: session.generation, input_revision: revision, step, status: 'running' },
    drafts: { ...state.drafts, new: { ...draft, stage: step === 'prepare' ? 'preparing' : step, error_code: undefined } } };
}

export function acceptPhotoStep(state: DemoState, job: ActiveJob, result: PhotoStepResult): DemoState {
  if (!currentPhotoJob(state, job) || result.step !== job.step) return state;
  const draft = state.drafts.new!;
  const revision = draft.input_revision;
  if (result.step === 'colors') {
    if (result.colors.source !== 'device' || result.colors.source_revision !== revision) return state;
    return { ...state, active_job: { ...job, step: 'analysis' }, drafts: { ...state.drafts, new: { ...draft, colors: result.colors, stage: 'analysis' } } };
  }
  if (result.step === 'analysis') {
    const analysis = result.analysis;
    if (analysis.source !== 'device' || analysis.source_revision !== revision) return state;
    return { ...state, active_job: { ...job, step: 'stamp' }, drafts: { ...state.drafts, new: { ...draft, analysis, stage: 'stamp', fields: { ...draft.fields, scene: analysis.scene, semantic_tags: [...analysis.semantic_tags], mood_tags: [...analysis.mood] } } } };
  }
  if (result.step === 'stamp') {
    if (result.stamp.source !== 'device' || result.stamp.input_revision !== revision) return state;
    return { ...state, route: 'compare', comparison_tab: 'stamp', model_status: 'ready', active_job: null,
      drafts: { ...state.drafts, new: { ...draft, stage: 'compare', selected_candidate: result.stamp, confirmation: null, error_code: undefined } } };
  }
  return { ...state, active_job: { ...job, step: 'colors' }, drafts: { ...state.drafts, new: { ...draft, stage: 'colors' } } };
}

export function failPhotoStep(state: DemoState, job: ActiveJob, interrupted = false): DemoState {
  if (!currentPhotoJob(state, job)) return state;
  const errors: Record<ProcessStep, DemoErrorCode> = { prepare: 'prepare_failed', colors: 'color_failed', analysis: 'analysis_failed', stamp: 'stamp_failed' };
  const error_code = interrupted ? 'interrupted' : errors[job.step];
  return { ...state, model_status: job.step === 'prepare' ? 'failed' : state.model_status === 'preparing' ? 'ready' : state.model_status, active_job: { ...job, status: 'failed', error_code },
    drafts: { ...state.drafts, new: { ...state.drafts.new!, stage: 'interrupted', error_code } } };
}

export function skipPhotoAnalysis(state: DemoState, jobId: string): DemoState {
  const draft = state.drafts.new;
  if (!draft || draft.error_code !== 'analysis_failed' || state.active_job?.status !== 'failed') return state;
  const analysis: Analysis = { source: 'device', source_revision: draft.input_revision, status: 'skipped', scene: null, semantic_tags: [], mood: [], ai_field_note: '', ai_field_note_edited: null, user_modified_fields: [] };
  return beginPhotoProcessing({ ...state, drafts: { ...state.drafts, new: { ...draft, analysis } } }, jobId);
}
