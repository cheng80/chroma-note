import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { getLocales } from 'expo-localization';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, startSessionRefresh } from '../services/supabase';
import { secureSessionStorage } from '../services/secure-session';
import { sendEmailOtp, verifyEmailOtp, signOut, authErrorCode } from '../services/auth';
import { clearDraftState, drainDraftCleanup, readDraftState, writeDraftState } from '../services/draft-store';
import { deleteRecord, fetchRecord, listRecords, saveRecord, setFavorite } from '../services/records';
import { pickPhoto, removeWorkingPhoto } from '../services/photo-input';
import { demoReducer, displayLocale, initialDemoState } from './demo-state';
import type { DemoAction } from './demo-state';
import type { DemoState, DemoErrorCode } from './contract';
import { acceptCaptionResult, acceptSavedRecord, bookState, preserveAdoptedCaption, replaceDraftPhoto, sameSession, signedOutState } from './app-state';
import { demoAssets, demoImages } from './demo-assets';
import { processPhotoStep } from '../services/photo-processing';
import { generatePhotoNote, preparePhotoAnalysis } from '../../modules/chroma-analysis';
import { acceptPhotoStep, beginPhotoProcessing, currentPhotoJob, failPhotoStep, skipPhotoAnalysis } from './processing-state';
import { calendarDateToLocalDate, localDateToCalendarDate } from './sheets/date-place';
const localePreferenceKey = 'chroma-locale-preference';

function deviceLocale() {
  return getLocales()[0]?.languageTag ?? Intl.DateTimeFormat().resolvedOptions().locale;
}

export function useAppController() {
  const [state, setState] = useState<DemoState>(() => ({ ...initialDemoState(deviceLocale()), auth: { request_id: null, email: '', status: 'pending' } }));
  const current = useRef(state);
  const queue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const generation = useRef(0);
  const authRequest = useRef(0);
  const listRequest = useRef(0);
  const cursor = useRef<string | null>(null);
  const mutation = useRef(false);
  const picking = useRef(false);
  const processing = useRef<AbortController | null>(null);
  const caption = useRef<AbortController | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState(Date.now());

  const notice = useCallback((ko: string, en: string) => {
    if (mounted.current) Alert.alert('Chroma Note', current.current.locale === 'ko' ? ko : en);
  }, []);

  // Persist drafts and the immutable save snapshot before exposing a transition.
  const apply = useCallback(async (next: DemoState, persist = true) => {
    if (!mounted.current) return;
    const before = current.current;
    if (persist && next.session && (next.drafts !== before.drafts || next.save_attempt !== before.save_attempt)) {
      await writeDraftState(next.session.owner_id, { drafts: next.drafts, save_attempt: next.save_attempt });
    }
    if (!mounted.current) return;
    current.current = next;
    setState(next);
  }, []);
  const enqueue = useCallback((work: () => Promise<void>) => {
    queue.current = queue.current.then(work).catch(() => notice('초안을 기기에 보관하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요.', 'Could not keep the draft on this device. Your input is unchanged. Try again.'));
    return queue.current;
  }, [notice]);

  const refresh = useCallback(async (more = false) => {
    const snapshot = current.current;
    const session = snapshot.session;
    if (!session || (more && !cursor.current)) return;
    const request = ++listRequest.current;
    setRefreshing(true);
    try {
      const page = await listRecords(session.owner_id, snapshot.book_filter, more ? cursor.current ?? undefined : undefined);
      await enqueue(async () => {
        const s = current.current;
        if (request !== listRequest.current || !sameSession(s, session.owner_id, session.generation)) return;
        cursor.current = page.cursor;
        const records = more ? [...s.records, ...page.records.filter(r => !s.records.some(old => old.id === r.id))] : page.records;
        await apply(bookState({ ...s, records }), false);
      });
    } catch {
      await enqueue(async () => {
        const s = current.current;
        if (request === listRequest.current && sameSession(s, session.owner_id, session.generation)) await apply({ ...s, book_state: s.records.length ? 'partial-cache' : 'error' }, false);
      });
    } finally { if (mounted.current && request === listRequest.current) setRefreshing(false); }
  }, [apply, enqueue]);

  const receiveSession = useCallback((session: Session | null) => {
    void enqueue(async () => {
      const s = current.current;
      if (!session) {
        processing.current?.abort();
        caption.current?.abort();
        generation.current += 1;
        listRequest.current += 1;
        cursor.current = null;
        mutation.current = false;
        await apply(signedOutState(s), false);
        return;
      }
      if (s.session?.owner_id === session.user.id) {
        // Refresh image credentials without ever persisting tokens with records.
        const image_headers = { Authorization: `Bearer ${session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' };
        await apply({ ...s, records: s.records.map(r => ({ ...r, stamp: { ...r.stamp, image_headers } })) }, false);
        return;
      }
      const local = await readDraftState(session.user.id);
      processing.current?.abort();
      caption.current?.abort();
      const next = signedOutState(s);
      await apply({ ...next, route: 'book', email: session.user.email ?? '', auth: { request_id: null, email: session.user.email ?? '', status: 'success' }, session: { source: 'supabase', owner_id: session.user.id, generation: ++generation.current, email: session.user.email ?? '', locale: s.locale }, drafts: local?.drafts ?? next.drafts, save_attempt: local?.save_attempt ?? null, book_state: 'loading' }, false);
      cursor.current = null;
      void drainDraftCleanup(session.user.id);
      void refresh();
    });
  }, [apply, enqueue, refresh]);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe = () => {};
    let stopRefresh = () => {};
    try {
      const client = getSupabase();
      const { data } = client.auth.onAuthStateChange((_event, session) => receiveSession(session));
      unsubscribe = () => data.subscription.unsubscribe();
      const stop = startSessionRefresh();
      const change = (value: string) => {
        if (value === 'active' && current.current.session) { void refresh(); void drainDraftCleanup(current.current.session.owner_id); }
        if (value === 'background') {
          processing.current?.abort();
          caption.current?.abort();
          void enqueue(async () => {
            const s = current.current;
            if (s.active_job) await apply(failPhotoStep(s, s.active_job, true));
          });
        }
      };
      change(AppState.currentState);
      const listener = AppState.addEventListener('change', change);
      stopRefresh = () => { listener.remove(); stop(); };
      void secureSessionStorage.getItem(localePreferenceKey).then((value) => {
        if (!['system', 'ko', 'en'].includes(value ?? '')) return;
        void enqueue(async () => {
          const s = current.current;
          const locale_preference = value as 'system' | 'ko' | 'en';
          const locale = displayLocale(locale_preference, deviceLocale());
          await apply({ ...s, locale_preference, locale, session: s.session ? { ...s.session, locale } : null }, false);
        });
      }).catch(() => undefined);
      void client.auth.getSession().then(({ error }) => { if (error) notice('세션을 복원하지 못했어요. 다시 로그인해 주세요.', 'Session restore failed. Please sign in again.'); });
    } catch {
      void enqueue(() => apply({ ...current.current, auth: { request_id: null, email: '', status: 'error', error_code: 'send_failed' } }, false));
      notice('Supabase 연결 설정을 확인해 주세요.', 'Check the Supabase connection settings.');
    }
    return () => { mounted.current = false; processing.current?.abort(); caption.current?.abort(); unsubscribe(); stopRefresh(); };
  }, [apply, enqueue, notice, receiveSession, refresh]);

  useEffect(() => {
    if (!state.auth.resend_available_at) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.auth.resend_available_at]);

  useEffect(() => {
    const session = state.session;
    if (!session || state.model_status !== 'unprepared') return;
    void enqueue(async () => {
      if (sameSession(current.current, session.owner_id, session.generation) && current.current.model_status === 'unprepared') {
        await apply({ ...current.current, model_status: 'preparing' }, false);
      }
    });
    void preparePhotoAnalysis().then(() => enqueue(async () => {
      if (sameSession(current.current, session.owner_id, session.generation) && current.current.model_status === 'preparing') {
        await apply({ ...current.current, model_status: 'ready' }, false);
      }
    })).catch(() => enqueue(async () => {
      if (sameSession(current.current, session.owner_id, session.generation) && current.current.model_status === 'preparing') {
        await apply({ ...current.current, model_status: 'failed' }, false);
      }
    }));
  }, [apply, enqueue, state.model_status, state.session]);

  const runSave = useCallback(async () => {
    const s = current.current;
    const attempt = s.save_attempt;
    const session = s.session;
    if (!attempt || !session || mutation.current) return;
    mutation.current = true;
    try {
      const record = await saveRecord(attempt);
      await enqueue(async () => {
        if (sameSession(current.current, session.owner_id, session.generation)) await apply(acceptSavedRecord(current.current, attempt.operation_id, record));
      });
      if (sameSession(current.current, session.owner_id, session.generation)) void refresh();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      await enqueue(async () => {
        const next = current.current;
        if (!sameSession(next, session.owner_id, session.generation) || next.save_attempt?.operation_id !== attempt.operation_id) return;
        await apply({ ...next, save_attempt: { ...next.save_attempt, state: code === 'conflict' ? 'conflict' : ['validation', 'forbidden', 'not_found', 'image_missing'].includes(code) ? 'failed' : 'uncertain', error_code: code === 'not_found' ? 'not_found' : code === 'conflict' ? 'conflict' : 'save_uncertain' } });
      });
      if (code === 'conflict') notice('다른 기기에서 수정된 기록이에요. 내 초안은 보관했습니다. 최신 기록을 확인한 뒤 다시 편집해 주세요.', 'The record changed on another device. Your draft is kept. Review the latest record before editing again.');
    } finally { mutation.current = false; }
  }, [apply, enqueue, notice, refresh]);

  const send = useCallback((action: DemoAction) => {
    void enqueue(async () => {
      const s = current.current;
      if (action.type === 'email' || action.type === 'code' || action.type === 'back-email') {
        if (action.type === 'back-email') authRequest.current += 1;
        await apply(demoReducer(s, action), false);
        return;
      }
      if (action.type === 'submit-email' || action.type === 'resend' || action.type === 'verify') {
        if (s.auth.status === 'pending') return;
        const verify = action.type === 'verify';
        const email = (action.type === 'resend' || verify ? s.auth.email : s.email).trim();
        if (!verify && s.auth.email === email && (s.auth.resend_available_at ?? 0) > Date.now()) return;
        const request = ++authRequest.current;
        await apply({ ...s, auth: { ...s.auth, email, request_id: String(request), status: 'pending', error_code: undefined } }, false);
        void (async () => {
          try {
            const result = verify ? await verifyEmailOtp(email, s.code) : await sendEmailOtp(email);
            if (result.error) throw result.error;
            await enqueue(async () => {
              if (request !== authRequest.current) return;
              const next = current.current;
              await apply({ ...next, ...(verify ? {} : { route: 'otp' as const, code: '' }), auth: { ...next.auth, email, status: 'success', resend_available_at: verify ? next.auth.resend_available_at : Date.now() + 60_000 } }, false);
            });
          } catch (error) {
            await enqueue(async () => {
              if (request !== authRequest.current) return;
              await apply({ ...current.current, auth: { ...current.current.auth, status: 'error', error_code: authErrorCode(error, verify ? 'verify' : 'send') as DemoErrorCode } }, false);
            });
          }
        })();
        return;
      }
      if (!s.session) return;
      const session = s.session;
      if (action.type === 'start-record' || action.type === 'use-photo' || action.type === 'replace-photo-confirm') {
        if (picking.current || mutation.current) return;
        if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state)) { notice('저장 대기 중인 초안을 먼저 확인해 주세요.', 'Resolve the pending save first.'); return; }
        if (action.type === 'start-record' && s.drafts.new) { await apply({ ...s, dialog: { kind: 'replace-photo', step: 'discard' } }, false); return; }
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
              const latest = current.current;
              if (!sameSession(latest, session.owner_id, session.generation)) { removeWorkingPhoto(session.owner_id, selected); return; }
              const previous = latest.drafts.new;
              const next = previous ? latest : demoReducer(latest, { type: 'start-record' });
              const draft = next.drafts.new!;
              const capturedDate = selected.captured_date && calendarDateToLocalDate(selected.captured_date) ? selected.captured_date : null;
              processing.current?.abort();
              caption.current?.abort();
              const replacement = replaceDraftPhoto({ ...draft, draft_id: previous?.draft_id ?? randomUUID(), owner_id: session.owner_id, record_id: previous?.record_id ?? randomUUID() }, selected, capturedDate, localDateToCalendarDate(new Date()));
              await apply({ ...next, route: 'photo', active_draft_kind: 'new', active_job: null, sheet: null, drafts: { ...next.drafts, new: replacement } });
              if (previous) removeWorkingPhoto(session.owner_id, previous.photo);
            });
          } catch {
            if (photo && current.current.drafts.new?.photo.local_uri !== photo.local_uri) removeWorkingPhoto(session.owner_id, photo);
            notice('사진을 가져오지 못했어요. 기기에 내려받은 JPEG, PNG 또는 HEIC 사진으로 다시 시도해 주세요. 기존 초안과 갤러리 원본은 유지됩니다.', 'Could not import this photo. Try a JPEG, PNG, or HEIC photo downloaded to this device. Your draft and gallery original are kept.');
          }
          finally { picking.current = false; }
        })();
        return;
      }
      if (action.type === 'continue-photo' || action.type === 'retry-processing') {
        if (s.active_job?.status === 'running' || mutation.current) return;
        await apply(beginPhotoProcessing(s, randomUUID()));
        return;
      }
      if (action.type === 'skip-analysis') { await apply(skipPhotoAnalysis(s, randomUUID())); return; }
      if (action.type === 'cancel-record') {
        processing.current?.abort();
        caption.current?.abort();
        const next = s.active_job ? failPhotoStep(s, s.active_job, true) : s;
        await apply(demoReducer(next, action));
        return;
      }
      if (action.type === 'resume-draft') {
        const next = demoReducer(s, action);
        await apply(next.route === 'processing' ? beginPhotoProcessing(next, randomUUID()) : next);
        return;
      }
      if (action.type === 'save' || action.type === 'retry-save') {
        if (mutation.current) return;
        if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state)) {
          if (s.save_attempt.state === 'conflict' || (s.save_attempt.state === 'failed' && s.save_attempt.base_version !== undefined)) {
            const attempt = s.save_attempt;
            void fetchRecord(session.owner_id, attempt.record_id).then(record => {
              if (!sameSession(current.current, session.owner_id, session.generation)) return;
              if (!record) { notice('삭제된 기록이라 저장할 수 없어요. 내 편집 초안은 유지됩니다.', 'This record was deleted. Your edit draft is kept.'); return; }
              const ko = current.current.locale === 'ko';
              Alert.alert(ko ? '최신 기록에 내 편집을 적용할까요?' : 'Apply your edits to the latest record?', ko ? `서버의 최신 메모: ${record.fields.user_note || '(없음)'}\n\n내 편집을 유지하면 최신 버전을 기준으로 다시 검토한 뒤 저장합니다.` : `Latest note: ${record.fields.user_note || '(empty)'}\n\nKeep your edits and review them against the latest version before saving.`, [
                { text: ko ? '취소' : 'Cancel', style: 'cancel' },
                { text: ko ? '내 편집 유지' : 'Keep my edits', onPress: () => void enqueue(async () => {
                  const latest = current.current;
                  if (!sameSession(latest, session.owner_id, session.generation) || latest.save_attempt?.operation_id !== attempt.operation_id || !latest.drafts.edit) return;
                  await apply({ ...latest, route: 'summary', active_draft_kind: 'edit', save_attempt: null, records: latest.records.map(r => r.id === record.id ? record : r), drafts: { ...latest.drafts, edit: { ...latest.drafts.edit, stage: 'summary', base_record_version: record.version, operation_id: undefined, selected_candidate: record.stamp } } });
                }) },
              ]);
            }).catch(() => notice('최신 기록을 불러오지 못했어요. 초안은 유지됩니다.', 'Could not load the latest record. Your draft is kept.'));
            return;
          }
          await apply({ ...s, save_attempt: { ...s.save_attempt, state: 'pending' } });
        } else {
          const next = demoReducer(s, { type: 'save' });
          if (!next.save_attempt || next.save_attempt === s.save_attempt) return;
          const operation_id = randomUUID();
          const kind = next.active_draft_kind!;
          await apply({ ...next, save_attempt: { ...next.save_attempt, operation_id, payload_snapshot: { ...next.save_attempt.payload_snapshot, locale: s.locale } }, drafts: { ...next.drafts, [kind]: { ...next.drafts[kind]!, operation_id } } });
        }
        void runSave();
        return;
      }
      if (action.type === 'logout' || action.type === 'logout-confirm') {
        if (mutation.current) { notice('서버 처리 결과를 확인한 뒤 로그아웃해 주세요.', 'Wait for the server operation before logging out.'); return; }
        if (action.type === 'logout' && (s.drafts.new || s.drafts.edit)) { await apply({ ...s, dialog: { kind: 'logout', step: 'discard' } }, false); return; }
        mutation.current = true;
        void (async () => {
          try {
            let remoteFailed = false;
            try {
              const result = await signOut();
              remoteFailed = Boolean(result.error);
            } catch { remoteFailed = true; }
            try {
              for (const draft of Object.values(s.drafts)) if (draft) removeWorkingPhoto(session.owner_id, draft.photo);
              await clearDraftState(session.owner_id);
            } catch { notice('이 기기의 작업 정리를 완료하지 못했어요. 다시 로그인하면 정리를 다시 시도해 주세요.', 'Could not finish clearing work on this device. Sign in again to retry cleanup.'); }
            receiveSession(null);
            if (remoteFailed) notice('이 기기에서는 로그아웃했지만 서버의 다른 세션 해제는 확인하지 못했어요.', 'You are signed out on this device, but other server sessions could not be confirmed.');
          } finally { mutation.current = false; }
        })();
        return;
      }
      if (action.type === 'toggle-favorite' || action.type === 'delete-confirm') {
        if (mutation.current) return;
        const record = s.records.find(r => r.id === (action.type === 'toggle-favorite' ? action.recordId : s.selected_record_id));
        if (!record) return;
        mutation.current = true;
        await apply({ ...s, dialog: null }, false);
        void (async () => {
          try {
            const updated = action.type === 'toggle-favorite' ? await setFavorite(record) : (await deleteRecord(session.owner_id, record.id, record.version), null);
            await enqueue(async () => {
              const next = current.current;
              if (!sameSession(next, session.owner_id, session.generation)) return;
              await apply(bookState({ ...next, records: updated ? next.records.map(r => r.id === updated.id ? updated : r) : next.records.filter(r => r.id !== record.id), ...(updated ? {} : { route: 'book' as const, selected_record_id: null, drafts: { ...next.drafts, edit: next.drafts.edit?.record_id === record.id ? null : next.drafts.edit } }) }));
            });
          } catch { notice('서버에 반영하지 못했어요. 최신 내용을 새로고침한 뒤 다시 시도해 주세요.', 'The change was not confirmed. Refresh and try again.'); }
          finally { mutation.current = false; if (sameSession(current.current, session.owner_id, session.generation)) void refresh(); }
        })();
        return;
      }
      if (action.type === 'request-caption') {
        const draft = s.active_draft_kind ? s.drafts[s.active_draft_kind] : null;
        if (!draft || s.sheet?.kind !== 'analysis' || s.sheet.caption_status === 'pending') return;
        if (draft.kind !== 'new' || draft.photo.source !== 'device') {
          notice('저장 후에는 원본 사진을 보관하지 않아 새 AI 문구를 만들 수 없어요. 기존 글과 메모는 직접 수정할 수 있어요.', 'The original photo is removed after saving, so new AI writing is unavailable. You can still edit existing writing and notes.');
          return;
        }
        const next = demoReducer(s, action);
        if (next.sheet?.kind !== 'analysis') return;
        const requestId = next.sheet.caption_request_id;
        if (!requestId) return;
        const requestedWriting = next.sheet.working.ai_field_note_edited;
        caption.current?.abort();
        const controller = new AbortController();
        caption.current = controller;
        await apply(next, false);
        void (async () => {
          try {
            const result = await generatePhotoNote({ uri: draft.photo.local_uri, inputRevision: draft.input_revision, locale: s.locale }, controller.signal);
            await enqueue(async () => {
              const latest = current.current;
              if (!sameSession(latest, session.owner_id, session.generation)) return;
              await apply(acceptCaptionResult(latest, requestId, result.inputRevision, requestedWriting, 'success', result.text), false);
            });
          } catch {
            await enqueue(async () => {
              if (sameSession(current.current, session.owner_id, session.generation)) await apply(acceptCaptionResult(current.current, requestId, draft.input_revision, requestedWriting, 'failure'), false);
            });
          } finally { if (caption.current === controller) caption.current = null; }
        })();
        return;
      }
      if (action.type === 'delete-account-result') { notice('계정 삭제는 서버의 최근 재인증 확인 후 진행됩니다. 연결 작업 중입니다.', 'Account deletion requires recent authentication. This connection is being prepared.'); await apply({ ...s, dialog: null }, false); return; }
      if (['scenario', 'save-result', 'delete-account-result', 'tick-processing', 'caption-result', 'regenerate', 'adopt-request', 'adopt-confirm', 'adopt-cancel'].includes(action.type)) return;
      if (action.type === 'retry-book' || action.type === 'retry-image' || action.type === 'load-more') { void refresh(action.type === 'load-more'); return; }
      if (action.type === 'edit-record' && s.drafts.edit && s.drafts.edit.record_id !== s.selected_record_id) { notice('저장하지 않은 편집 초안이 있어요. 먼저 해당 기록의 편집을 마쳐 주세요.', 'Finish the existing edit draft first.'); return; }
      if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state) && ['sheet-apply', 'replace-photo-confirm', 'regenerate', 'edit-record'].includes(action.type)) { notice('이전 저장 결과를 먼저 확인해 주세요. 같은 저장 요청으로 재시도할 수 있어요.', 'Resolve the pending save before making more changes. Retry the same save request.'); return; }
      const reducedAction = action.type === 'locale' ? { ...action, systemLocale: deviceLocale() } : action;
      let next = demoReducer(s, reducedAction);
      if (action.type === 'sheet-apply') next = preserveAdoptedCaption(s, next);
      if (action.type === 'edit-record' && s.drafts.edit?.record_id === s.selected_record_id) next = { ...next, drafts: s.drafts };
      if (action.type === 'sheet-cancel' || action.type === 'sheet-discard-confirm' || action.type === 'sheet-apply') caption.current?.abort();
      await apply(next);
      if (action.type === 'locale') void secureSessionStorage.setItem(localePreferenceKey, action.value).catch(() => notice('언어 설정을 저장하지 못했어요.', 'Could not save the language setting.'));
      if (action.type === 'back-book' || action.type === 'back-settings' || (action.type === 'sheet-apply' && s.sheet?.kind === 'filter')) void refresh();
      if (action.type === 'open-detail') {
        void fetchRecord(session.owner_id, action.recordId).then(record => enqueue(async () => {
          if (!sameSession(current.current, session.owner_id, session.generation)) return;
          if (record) await apply({ ...current.current, records: current.current.records.map(r => r.id === record.id ? record : r) }, false);
          else { await apply(bookState({ ...current.current, route: 'book', selected_record_id: null, records: current.current.records.filter(r => r.id !== action.recordId) }), false); notice('서버에서 삭제된 기록이에요.', 'This record was deleted on the server.'); }
        })).catch(() => notice('최신 기록을 확인하지 못했어요. 새로고침해 주세요.', 'Could not load the latest record. Please refresh.'));
      }
    });
  }, [apply, enqueue, notice, receiveSession, refresh, runSave]);

  useEffect(() => {
    const job = state.active_job;
    const draft = current.current.drafts.new;
    if (!job || job.status !== 'running' || !draft || !currentPhotoJob(current.current, job)) return;
    const controller = new AbortController();
    processing.current = controller;
    void (async () => {
      try {
        const result = await processPhotoStep(draft.photo, job, current.current.locale, controller.signal);
        await enqueue(async () => {
          const s = current.current;
          const next = controller.signal.aborted ? s : acceptPhotoStep(s, job, result);
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
      } catch {
        if (!controller.signal.aborted) await enqueue(() => apply(failPhotoStep(current.current, job)));
      } finally { if (processing.current === controller) processing.current = null; }
    })();
    return () => controller.abort();
  }, [apply, enqueue, state.active_job]);

  const draft = state.active_draft_kind ? state.drafts[state.active_draft_kind] : state.drafts.new ?? state.drafts.edit;
  const record = state.records.find(item => item.id === state.selected_record_id);
  const authenticatedImage = state.records.find(item => item.id === draft?.record_id)?.stamp.image_headers ?? state.records[0]?.stamp.image_headers;
  const displayDraft = draft?.selected_candidate?.source === 'supabase' ? { ...draft, selected_candidate: { ...draft.selected_candidate, image_headers: authenticatedImage } } : draft;
  return { state, send, images: demoImages, assets: demoAssets, visibleRecords: state.records, draft: displayDraft, record, hasMore: Boolean(cursor.current), refreshing, resendSeconds: Math.max(0, Math.ceil(((state.auth.resend_available_at ?? 0) - clock) / 1000)) };
}
