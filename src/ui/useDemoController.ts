import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { assertDemoInvariants, demoReducer, filterRecords, initialDemoState } from './demo-state';
import type { DemoAction } from './demo-state';
import { demoAssets, demoImages } from './demo-assets';

export function useDemoController() {
  const [state, dispatch] = useReducer(demoReducer, undefined, initialDemoState);
  const send = useCallback((action: DemoAction) => dispatch(action), []);
  const visibleRecords = useMemo(() => filterRecords(state.records, state.book_filter).slice(0, state.page_size), [state.records, state.book_filter, state.page_size]);
  const draft = state.active_draft_kind ? state.drafts[state.active_draft_kind] : state.drafts.new ?? state.drafts.edit;
  const record = state.records.find((item) => item.id === state.selected_record_id);

  useEffect(() => {
    try { assertDemoInvariants(state); } catch (error) { console.warn(error); }
  }, [state]);

  useEffect(() => {
    const job = state.active_job;
    if (!job || job.status !== 'running') return undefined;
    const timer = setTimeout(() => send({ type: 'tick-processing', jobId: job.job_id, inputRevision: job.input_revision }), 260);
    return () => clearTimeout(timer);
  }, [send, state.active_job]);

  const captionSheet = state.sheet?.kind === 'analysis' || state.sheet?.kind === 'memo' ? state.sheet : null;
  const captionRequestId = captionSheet?.caption_request_id;
  const captionInputRevision = draft?.input_revision;
  const storedCaption = draft ? (draft.fields.ai_field_note_edited === null ? draft.fields.ai_field_note : draft.fields.ai_field_note_edited) : '';
  const captionBasis = draft?.fields.scene ?? draft?.fields.semantic_tags[0];
  const captionFixture = storedCaption || (state.locale === 'ko' ? captionBasis ? `${captionBasis}, 오래 남을 순간이에요.` : '빛이 머문 길을 조용히 기록했어요.' : captionBasis ? `A quiet note inspired by ${captionBasis}.` : 'A quiet note for the light along the way.');

  useEffect(() => {
    if (captionSheet?.caption_status !== 'pending' || !captionRequestId || captionInputRevision === undefined) return undefined;
    const timer = setTimeout(() => {
      if (state.scenario === 'analysis-failed') send({ type: 'caption-result', requestId: captionRequestId, inputRevision: captionInputRevision, outcome: 'failure' });
      else send({ type: 'caption-result', requestId: captionRequestId, inputRevision: captionInputRevision, outcome: 'success', value: captionFixture });
    }, 250);
    return () => clearTimeout(timer);
  }, [captionFixture, captionInputRevision, captionRequestId, captionSheet?.caption_status, send, state.scenario]);

  useEffect(() => {
    const attempt = state.save_attempt;
    if (!attempt || attempt.state !== 'pending') return undefined;
    const outcome = state.scenario === 'save-failed' ? 'failed' : state.scenario === 'save-uncertain' ? 'uncertain' : state.scenario === 'save-conflict' ? 'conflict' : 'success';
    const timer = setTimeout(() => send({ type: 'save-result', operationId: attempt.operation_id, outcome }), 300);
    return () => clearTimeout(timer);
  }, [send, state.save_attempt, state.scenario]);

  return { state, send, images: demoImages, assets: demoAssets, visibleRecords, draft, record };
}
