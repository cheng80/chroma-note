import { listDrafts } from '../domain/draft-collection';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { drainDraftCleanup } from '../services/draft-store';
import { currentDraft, initialDemoState, isSaveableDraft, type DemoAction } from './demo-state';
import { demoAssets, demoImages } from './demo-assets';
import { useControllerStore } from './controller/controller-store';
import { createRecordOperations } from './controller/record-operations';
import { useSessionWorkflow } from './controller/useSessionWorkflow';
import { useRecordCollection } from './controller/useRecordCollection';
import { useRecordSaving } from './controller/useRecordSaving';
import { usePhotoWorkflow } from './controller/usePhotoWorkflow';
import { deviceLocale, useLocalActions } from './controller/useLocalActions';

/** Composition root: routes user actions; each workflow owns its effects and task state. */
export function useAppController() {
  const { state, store } = useControllerStore(() => initialDemoState(deviceLocale()));
  const [operations] = useState(() => createRecordOperations(store));
  const { handle: photoAction, cancel, cancelCaption, background } = usePhotoWorkflow(store, state);
  // Session notifications are wired here, after all workflows exist, before effects start.
  const onSessionChanged = useRef<(refresh: boolean) => void>(() => {});
  const sessionEvents = useMemo(() => ({
    changing: () => { cancel(); operations.invalidate(); },
    changed: (refresh: boolean) => onSessionChanged.current(refresh),
  }), [cancel, operations]);
  const session = useSessionWorkflow(store, state, sessionEvents);
  const collection = useRecordCollection(store, operations, session.rejectRecordSession);
  const { sessionChanged, refresh, handle: collectionAction } = collection;
  useLayoutEffect(() => { onSessionChanged.current = sessionChanged; }, [sessionChanged]);
  const { handle: saveAction } = useRecordSaving(store, operations, session.rejectRecordSession, refresh, session.finishLogout, collection.online);
  const { handle: sessionAction } = session;
  const localAction = useLocalActions(store, cancelCaption, refresh);

  const send = useCallback((action: DemoAction) => {
    void store.enqueue(async () => {
      if (await sessionAction(action)) return;
      if (!store.getState().session) return;
      if (operations.busy()) {
        if (operations.allowsPhotoWork() && await photoAction(action)) return;
        store.notice('서버 처리 결과를 확인하고 있어요. 잠시만 기다려 주세요.', 'Checking the server result. Please wait.');
        return;
      }
      if (operations.savingForLogout()) return;
      if (await saveAction(action) || await photoAction(action) || await collectionAction(action)) return;
      await localAction(action);
    });
  }, [collectionAction, localAction, operations, photoAction, saveAction, sessionAction, store]);

  useEffect(() => {
    const change = (value: string) => {
      if (value === 'active') {
        const active = store.getState().session;
        if (active) { void refresh(); void drainDraftCleanup(active.owner_id); }
      }
      if (value === 'background') background();
    };
    change(AppState.currentState);
    const listener = AppState.addEventListener('change', change);
    return () => { listener.remove(); cancel(); operations.reset(); };
  }, [background, cancel, operations, refresh, store]);

  const draft = currentDraft(state);
  const record = state.records.find(item => item.id === state.selected_record_id);
  const displayDrafts = listDrafts(state.drafts).map(item => {
    if (item.selected_candidate?.source !== 'supabase') return item;
    const recordImage = state.records.find(record => record.id === item.record_id)?.stamp;
    const headers = recordImage?.image_headers ?? state.records[0]?.stamp.image_headers;
    return { ...item, selected_candidate: { ...item.selected_candidate,
      ...(recordImage ? { local_uri: recordImage.local_uri, image_headers: recordImage.image_headers } : { image_headers: headers }) } };
  });
  const displayDraft = displayDrafts.find(item => item.draft_id === draft?.draft_id) ?? draft;
  return { state, send, images: demoImages, assets: demoAssets, visibleRecords: state.records, draft: displayDraft, displayDrafts, record,
    pendingDeletions: collection.pendingDeletions, hasMore: collection.hasMore, refreshing: collection.refreshing, pullRefreshing: collection.pullRefreshing,
    canSaveBeforeLogout: collection.online && listDrafts(state.drafts).every(isSaveableDraft) && !['conflict', 'failed'].includes(state.save_attempt?.state ?? ''),
    sessionRestoreStatus: session.sessionRestoreStatus, retrySessionRestore: session.retrySessionRestore,
    beginSessionReauthentication: session.beginSessionReauthentication, resendSeconds: session.resendSeconds };
}
