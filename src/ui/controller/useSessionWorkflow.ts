import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, startSessionRefresh } from '../../services/supabase';
import { sendEmailOtp, verifyEmailOtp, signOut, authErrorCode } from '../../services/auth';
import { clearDraftState, drainDraftCleanup, readDraftState } from '../../services/draft-store';
import { clearRecordCache, readRecordCache } from '../../services/record-cache';
import { abortSave } from '../../services/records';
import { signedOutState } from '../app-state';
import { demoReducer, type DemoAction } from '../demo-state';
import type { DemoErrorCode, DemoSession, DemoState } from '../contract';
import type { ControllerStore } from './controller-store';

interface SessionEvents {
  changing(): void;
  changed(refreshRecords: boolean): void;
}

export function useSessionWorkflow(store: ControllerStore, state: DemoState, events: SessionEvents) {
  const { getState, apply, enqueue, isCurrent, isMounted, notice } = store;
  const generation = useRef(0);
  const authRequest = useRef(0);
  const restoreRequest = useRef(0);
  const explicitLogout = useRef(false);
  const [sessionRestoreStatus, setSessionRestoreStatus] = useState<'restoring' | 'failed' | 'complete'>('restoring');
  const [clock, setClock] = useState(Date.now());

  const receiveSession = useCallback((session: Session | null, request?: number, restoreFailed = false, refreshRecords = true) => enqueue(async () => {
    const stale = () => request !== undefined && request !== restoreRequest.current;
    if (stale()) return;
    const finish = (status: 'failed' | 'complete') => {
      if (request !== undefined && !stale() && isMounted()) setSessionRestoreStatus(status);
    };
    try {
      const s = getState();
      if (!session) {
        const rejected = restoreFailed || (!explicitLogout.current && Boolean(s.session));
        explicitLogout.current = false;
        events.changing();
        generation.current += 1;
        await apply(signedOutState(s), false);
        events.changed(false);
        finish(rejected ? 'failed' : 'complete');
        return;
      }
      if (s.session?.owner_id === session.user.id) {
        const image_headers = { Authorization: `Bearer ${session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' };
        await apply({ ...s, records: s.records.map(r => ({ ...r, stamp: { ...r.stamp, image_headers } })) }, false);
        finish('complete');
        events.changed(refreshRecords);
        return;
      }
      const local = await readDraftState(session.user.id);
      const cached = await readRecordCache(session.user.id, s.book_filter).catch(() => []);
      if (stale()) return;
      events.changing();
      const next = signedOutState(s);
      await apply({ ...next, route: 'book', email: session.user.email ?? '', auth: { request_id: null, email: session.user.email ?? '', status: 'success' }, session: { source: 'supabase', owner_id: session.user.id, generation: ++generation.current, email: session.user.email ?? '', locale: s.locale }, drafts: local?.drafts ?? next.drafts, save_attempt: local?.save_attempt ?? null, records: cached, book_state: cached.length ? 'partial-cache' : 'loading' }, false);
      void drainDraftCleanup(session.user.id);
      finish('complete');
      events.changed(true);
    } catch (error) {
      if (request !== undefined) { finish('failed'); return; }
      throw error;
    }
  }), [apply, enqueue, events, getState, isMounted]);

  const retrySessionRestore = useCallback(() => {
    const request = ++restoreRequest.current;
    if (isMounted()) setSessionRestoreStatus('restoring');
    let client;
    try { client = getSupabase(); }
    catch { void receiveSession(null, request, true); return; }
    void client.auth.getSession().then(({ data, error }) => {
      if (request !== restoreRequest.current) return;
      void receiveSession(error ? null : data.session, request, Boolean(error));
    }).catch(() => { void receiveSession(null, request, true); });
  }, [isMounted, receiveSession]);

  const beginSessionReauthentication = useCallback(() => {
    restoreRequest.current += 1;
    if (isMounted()) setSessionRestoreStatus('complete');
  }, [isMounted]);

  // All final record-auth failures cross this one session-owned transition.
  const rejectRecordSession = useCallback(async (error: unknown, session: DemoSession, stillRelevant: () => boolean = () => true) => {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'unauthorized') return false;
    let rejection: Promise<void> | undefined;
    await enqueue(async () => {
      if (isCurrent(session) && stillRelevant()) rejection = receiveSession(null, ++restoreRequest.current, true);
    });
    await rejection;
    return true;
  }, [enqueue, isCurrent, receiveSession]);

  const finishLogout = useCallback(async () => {
    const s = getState();
    const session = s.session;
    if (!session) return;
    events.changing();
    let localCleanupFailed = false;
    try {
      if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state) && s.save_attempt.base_version === undefined) {
        try { await abortSave(s.save_attempt, () => isCurrent(session)); } catch { /* Server cleanup owns unfinished uploads. */ }
      }
      try { await clearRecordCache(session.owner_id); } catch { localCleanupFailed = true; }
      if (!localCleanupFailed) try { await clearDraftState(session.owner_id); } catch { localCleanupFailed = true; }
      if (!isCurrent(session)) return;
      if (localCleanupFailed) {
        notice('이 기기의 일부 작업 정리를 완료하지 못했어요. 일부 항목은 이미 지워졌을 수 있으니 정리를 다시 시도해 주세요.', 'Could not finish all cleanup on this device. Some items may already be removed; try cleanup again.');
        return;
      }
      explicitLogout.current = true;
      const result = await signOut();
      if (isCurrent(session)) void receiveSession(null);
      if (result.error) notice('이 기기에서는 로그아웃했지만 서버의 다른 세션 해제는 확인하지 못했어요.', 'You are signed out on this device, but other server sessions could not be confirmed.');
    } catch {
      if (isCurrent(session)) notice('이 기기의 작업 정리를 완료하지 못했어요. 일부 항목은 이미 지워졌을 수 있으니 정리를 다시 시도해 주세요.', 'Could not finish cleanup on this device. Some items may already be removed; try cleanup again.');
    }
  }, [events, getState, isCurrent, notice, receiveSession]);

  const handle = useCallback(async (action: DemoAction) => {
    const s = getState();
    if (action.type === 'email' || action.type === 'code' || action.type === 'back-email') {
      if (action.type === 'back-email') authRequest.current += 1;
      await apply(demoReducer(s, action), false);
      return true;
    }
    if (action.type !== 'submit-email' && action.type !== 'resend' && action.type !== 'verify') return false;
    if (s.auth.status === 'pending') return true;
    const verify = action.type === 'verify';
    const email = (action.type === 'resend' || verify ? s.auth.email : s.email).trim();
    if (!verify && s.auth.email === email && (s.auth.resend_available_at ?? 0) > Date.now()) return true;
    const request = ++authRequest.current;
    await apply({ ...s, auth: { ...s.auth, email, request_id: String(request), status: 'pending', error_code: undefined } }, false);
    void (async () => {
      try {
        const result = verify ? await verifyEmailOtp(email, s.code) : await sendEmailOtp(email);
        if (result.error) throw result.error;
        const resendAvailableAt = 'resendAvailableAt' in result.data ? result.data.resendAvailableAt : undefined;
        await enqueue(async () => {
          if (request !== authRequest.current) return;
          const next = getState();
          await apply({ ...next, ...(verify ? {} : { route: 'otp' as const, code: '' }), auth: { ...next.auth, email, status: 'success', resend_available_at: resendAvailableAt ?? next.auth.resend_available_at } }, false);
        });
      } catch (error) {
        await enqueue(async () => {
          if (request !== authRequest.current) return;
          await apply({ ...getState(), auth: { ...getState().auth, status: 'error', error_code: authErrorCode(error, verify ? 'verify' : 'send') as DemoErrorCode } }, false);
        });
      }
    })();
    return true;
  }, [apply, enqueue, getState]);

  useEffect(() => {
    let unsubscribe = () => {};
    let stopRefresh = () => {};
    try {
      const client = getSupabase();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        if ((getState().session?.owner_id ?? null) !== (session?.user.id ?? null)) setSessionRestoreStatus('restoring');
        void receiveSession(session, ++restoreRequest.current, event === 'SIGNED_OUT' && !explicitLogout.current, event !== 'TOKEN_REFRESHED');
      });
      unsubscribe = () => data.subscription.unsubscribe();
      stopRefresh = startSessionRefresh();
      retrySessionRestore();
    } catch { setSessionRestoreStatus('failed'); }
    return () => { restoreRequest.current += 1; authRequest.current += 1; unsubscribe(); stopRefresh(); };
  }, [getState, receiveSession, retrySessionRestore]);

  useEffect(() => {
    if (!state.auth.resend_available_at) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.auth.resend_available_at]);

  return { handle, finishLogout, rejectRecordSession, sessionRestoreStatus, retrySessionRestore, beginSessionReauthentication,
    resendSeconds: Math.max(0, Math.ceil(((state.auth.resend_available_at ?? 0) - clock) / 1000)) };
}

export type RejectRecordSession = ReturnType<typeof useSessionWorkflow>['rejectRecordSession'];
