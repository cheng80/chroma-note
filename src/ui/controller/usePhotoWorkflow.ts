import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { photoInputFailure, pickPhoto, removeWorkingPhoto } from '../../services/photo-input';
import { processPhotoStep } from '../../services/photo-processing';
import { generatePhotoNote, preparePhotoAnalysis, unloadPhotoAnalysis } from '../../../modules/chroma-analysis';
import { demoReducer } from '../demo-state';
import type { DemoAction } from '../demo-state';
import type { DemoState } from '../contract';
import { acceptCaptionResult, replaceDraftPhoto } from '../app-state';
import { acceptPhotoStep, beginPhotoProcessing, currentPhotoJob, failPhotoStep, skipPhotoAnalysis } from '../processing-state';
import { calendarDateToLocalDate, localDateToCalendarDate } from '../sheets/date-place';
import type { ControllerStore } from './controller-store';

export function usePhotoWorkflow(store: ControllerStore, state: DemoState) {
  const picking = useRef(false);
  const processing = useRef<AbortController | null>(null);
  const caption = useRef<AbortController | null>(null);
  const { getState, apply, enqueue, isCurrent, isMounted, notice } = store;

  const cancelCaption = useCallback(() => { caption.current?.abort(); }, []);
  const cancel = useCallback(() => {
    processing.current?.abort();
    cancelCaption();
  }, [cancelCaption]);
  const background = useCallback(() => {
    cancel();
    void enqueue(async () => {
      const s = getState();
      if (s.active_job) await apply(failPhotoStep(s, s.active_job, true));
    });
  }, [apply, cancel, enqueue, getState]);

  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    const session = state.session;
    if (!session || state.model_status !== 'unprepared') return;
    void enqueue(async () => {
      if (isCurrent(session) && getState().model_status === 'unprepared') {
        await apply({ ...getState(), model_status: 'preparing' }, false);
      }
    });
    void preparePhotoAnalysis().then(() => enqueue(async () => {
      if (isCurrent(session) && getState().model_status === 'preparing') {
        await apply({ ...getState(), model_status: 'ready' }, false);
      }
    })).catch(() => enqueue(async () => {
      if (isCurrent(session) && getState().model_status === 'preparing') {
        await apply({ ...getState(), model_status: 'failed' }, false);
      }
    }));
  }, [apply, enqueue, getState, isCurrent, state.model_status, state.session]);

  useEffect(() => {
    const subscription = AppState.addEventListener('memoryWarning', () => {
      // Running jobs retain their engine until cancellation/finish; release idle models only.
      void enqueue(async () => {
        if (processing.current || caption.current || getState().model_status === 'preparing') return;
        const session = getState().session;
        let released = false;
        try { released = await unloadPhotoAnalysis(); } catch { return; }
        if (!released || !session || !isCurrent(session)) return;
        await apply({ ...getState(), model_status: 'failed' }, false);
        notice('메모리 확보를 위해 사진 분석을 잠시 내려놓았어요. 다시 변환하면 준비를 이어갑니다.', 'Photo analysis was released to free memory. It will prepare again when you convert a photo.');
      });
    });
    return () => subscription.remove();
  }, [apply, enqueue, getState, isCurrent, notice]);

  // The parent already owns the serial queue. Only detached service completions enqueue work.
  const handle = useCallback(async (action: DemoAction): Promise<boolean> => {
    const s = getState();
    const session = s.session;
    if (!session) return false;
    if (action.type === 'retry-model') {
      if (processing.current || caption.current || s.model_status === 'preparing') return true;
      try {
        await unloadPhotoAnalysis();
        await apply({ ...getState(), model_status: 'unprepared' }, false);
      } catch { notice('진행 중인 사진 분석이 끝난 뒤 다시 시도해 주세요.', 'Try again after the current photo analysis finishes.'); }
      return true;
    }
    if (action.type === 'start-record' || action.type === 'use-photo' || action.type === 'replace-photo-confirm') {
      if (picking.current) return true;
      if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state)) { notice('저장 대기 중인 초안을 먼저 확인해 주세요.', 'Resolve the pending save first.'); return true; }
      if (action.type === 'start-record' && s.drafts.new) { await apply({ ...s, dialog: { kind: 'replace-photo', step: 'discard' } }, false); return true; }
      picking.current = true;
      await apply({ ...s, dialog: null }, false);
      void (async () => {
        let photo: Awaited<ReturnType<typeof pickPhoto>> = null;
        try {
          const revision = (s.drafts.new?.input_revision ?? 0) + 1;
          photo = await pickPhoto(session.owner_id, revision);
          if (!photo) return;
          const selected = photo;
          await enqueue(async () => {
            const latest = getState();
            if (!isMounted() || !isCurrent(session)) { removeWorkingPhoto(session.owner_id, selected); return; }
            const previous = latest.drafts.new;
            const next = previous ? latest : demoReducer(latest, { type: 'start-record' });
            const draft = next.drafts.new!;
            const capturedDate = selected.captured_date && calendarDateToLocalDate(selected.captured_date) ? selected.captured_date : null;
            cancel();
            const replacement = replaceDraftPhoto({ ...draft, draft_id: previous?.draft_id ?? randomUUID(), owner_id: session.owner_id, record_id: previous?.record_id ?? randomUUID() }, selected, capturedDate, localDateToCalendarDate(new Date()));
            await apply({ ...next, route: 'photo', active_draft_kind: 'new', active_job: null, sheet: null, drafts: { ...next.drafts, new: replacement } });
            if (previous) removeWorkingPhoto(session.owner_id, previous.photo);
          });
        } catch (error) {
          if (photo && getState().drafts.new?.photo.local_uri !== photo.local_uri) removeWorkingPhoto(session.owner_id, photo);
          const failure = photoInputFailure(error);
          notice(failure.message.ko, failure.message.en);
        }
        finally { picking.current = false; }
      })();
      return true;
    }
    if (action.type === 'continue-photo' || action.type === 'retry-processing') {
      if (s.active_job?.status === 'running') return true;
      await apply(beginPhotoProcessing(s, randomUUID()));
      return true;
    }
    if (action.type === 'skip-analysis') { await apply(skipPhotoAnalysis(s, randomUUID())); return true; }
    if (action.type === 'cancel-record') {
      cancel();
      const next = s.active_job ? failPhotoStep(s, s.active_job, true) : s;
      await apply(demoReducer(next, action));
      return true;
    }
    if (action.type === 'resume-draft') {
      const next = demoReducer(s, action);
      await apply(next.route === 'processing' ? beginPhotoProcessing(next, randomUUID()) : next);
      return true;
    }
    if (action.type === 'request-caption') {
      const draft = s.active_draft_kind ? s.drafts[s.active_draft_kind] : null;
      if (!draft || s.sheet?.kind !== 'analysis' || s.sheet.caption_status === 'pending') return true;
      if (draft.kind !== 'new' || draft.photo.source !== 'device') {
        notice('저장 후에는 원본 사진을 보관하지 않아 새 AI 문구를 만들 수 없어요. 기존 글과 메모는 직접 수정할 수 있어요.', 'The original photo is removed after saving, so new AI writing is unavailable. You can still edit existing writing and notes.');
        return true;
      }
      const next = demoReducer(s, action);
      if (next.sheet?.kind !== 'analysis') return true;
      const requestId = next.sheet.caption_request_id;
      if (!requestId) return true;
      const requestedWriting = next.sheet.working.user_note;
      cancelCaption();
      const controller = new AbortController();
      caption.current = controller;
      await apply(next, false);
      void (async () => {
        try {
          const result = await generatePhotoNote({ uri: draft.photo.local_uri, inputRevision: draft.input_revision, locale: s.locale }, controller.signal);
          await enqueue(async () => {
            const latest = getState();
            if (!isCurrent(session)) return;
            await apply(acceptCaptionResult(latest, requestId, result.inputRevision, requestedWriting, controller.signal.aborted ? 'failure' : 'success', result.text), false);
          });
        } catch {
          await enqueue(async () => {
            if (isCurrent(session)) await apply(acceptCaptionResult(getState(), requestId, draft.input_revision, requestedWriting, 'failure'), false);
          });
        } finally { if (caption.current === controller) caption.current = null; }
      })();
      return true;
    }
    return false;
  }, [apply, cancel, cancelCaption, enqueue, getState, isCurrent, isMounted, notice]);

  useEffect(() => {
    const job = state.active_job;
    const draft = getState().drafts.new;
    if (!job || job.status !== 'running' || !draft || !currentPhotoJob(getState(), job)) return;
    const controller = new AbortController();
    processing.current = controller;
    void (async () => {
      try {
        const result = await processPhotoStep(draft.photo, job, getState().locale, controller.signal);
        await enqueue(async () => {
          const s = getState();
          const next = controller.signal.aborted || !isMounted() ? s : acceptPhotoStep(s, job, result);
          if (next === s) {
            if (result.step === 'stamp') removeWorkingPhoto(job.owner_id, { ...draft.photo, local_uri: result.stamp.local_uri });
            return;
          }
          try { await apply(next); }
          catch (error) {
            if (result.step === 'stamp') removeWorkingPhoto(job.owner_id, { ...draft.photo, local_uri: result.stamp.local_uri });
            await apply(failPhotoStep(s, job), false);
            throw error;
          }
        });
      } catch (error) {
        if (!controller.signal.aborted) await enqueue(() => apply(failPhotoStep(getState(), job, false, error)));
      } finally { if (processing.current === controller) processing.current = null; }
    })();
    return () => controller.abort();
  }, [apply, enqueue, getState, isMounted, state.active_job]);

  return { handle, cancel, cancelCaption, background };
}
