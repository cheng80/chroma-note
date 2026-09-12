import { useCallback, useRef, useState } from 'react';
import { deleteRecord, fetchRecord, listRecords, setFavorite } from '../../services/records';
import { cacheReadyRecords, pruneCachedRecords, queueRecordDeletion, readRecordCache, readRecordDeletions, removeCachedRecord, removeRecordDeletion } from '../../services/record-cache';
import { bookState } from '../app-state';
import { demoReducer, type DemoAction } from '../demo-state';
import type { ControllerStore } from './controller-store';
import type { RecordOperations } from './record-operations';
import type { RejectRecordSession } from './useSessionWorkflow';

export function useRecordCollection(store: ControllerStore, operations: RecordOperations, rejectSession: RejectRecordSession) {
  const { getState, apply, enqueue, isCurrent, isMounted, notice } = store;
  const cursor = useRef<string | null>(null);
  const initialSession = getState().session;
  const sessionKey = useRef(initialSession ? `${initialSession.owner_id}:${initialSession.generation}` : '');
  const reportedConflicts = useRef(new Set<string>());
  const [online, setOnline] = useState(false);
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const refresh = useCallback(async (more = false) => {
    const snapshot = getState();
    const session = snapshot.session;
    if (!session || (more && !cursor.current)) return;
    let request = operations.request(session, true);
    if (!request) return;
    setRefreshing(true);
    try {
      const deletions = await readRecordDeletions(session.owner_id);
      if (!operations.accepts(request)) return;
      setPendingDeletions(deletions.map(item => item.record_id));
      if (deletions.length) {
        const release = operations.acquire(session);
        if (!release) return;
        try {
          for (const deletion of deletions) {
            if (!isCurrent(session)) return;
            try {
              await deleteRecord(session.owner_id, deletion.record_id, deletion.base_version);
              await removeCachedRecord(session.owner_id, deletion.record_id);
              await removeRecordDeletion(session.owner_id, deletion.record_id);
            } catch (error) {
              const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
              if (code === 'unauthorized') throw error;
              if (code === 'not_found') {
                await removeCachedRecord(session.owner_id, deletion.record_id);
                await removeRecordDeletion(session.owner_id, deletion.record_id);
                continue;
              }
              if (code === 'conflict' && isCurrent(session) && !reportedConflicts.current.has(deletion.record_id)) {
                reportedConflicts.current.add(deletion.record_id);
                notice('삭제 대기 중인 기록이 변경됐어요. 최신 내용을 확인한 뒤 삭제를 다시 선택해 주세요.', 'A record awaiting deletion changed. Review the latest version before deleting again.');
              }
              if (code === 'conflict') continue;
              break;
            }
          }
        } finally {
          release();
          request = operations.request(session, true);
        }
        if (!request) return;
      }
      const page = await listRecords(session.owner_id, snapshot.book_filter, more ? cursor.current ?? undefined : undefined);
      const pageRequest = request;
      await enqueue(async () => {
        if (!operations.accepts(pageRequest)) return;
        const pending = await readRecordDeletions(session.owner_id);
        if (!operations.accepts(pageRequest)) return;
        const s = getState();
        setOnline(true);
        setPendingDeletions(pending.map(item => item.record_id));
        cursor.current = page.cursor;
        setHasMore(Boolean(page.cursor));
        const records = more ? [...s.records, ...page.records.filter(r => !s.records.some(old => old.id === r.id))] : page.records;
        await apply(bookState({ ...s, records }), false);
        void cacheReadyRecords(session.owner_id, records, snapshot.book_filter, pageRequest.signal).then(async () => {
          if (!page.cursor && !Object.values(snapshot.book_filter).some(Boolean) && !pageRequest.signal.aborted) await pruneCachedRecords(session.owner_id, records.map(record => record.id), pageRequest.signal);
        }).catch(() => undefined);
      });
    } catch (error) {
      const failedRequest = request;
      if (await rejectSession(error, session, () => Boolean(failedRequest && operations.isLatest(failedRequest)))) return;
      const cached = await readRecordCache(session.owner_id, snapshot.book_filter).catch(() => []);
      await enqueue(async () => {
        if (!failedRequest || !operations.accepts(failedRequest)) return;
        setOnline(false);
        const cachedState = bookState({ ...getState(), records: cached });
        await apply({ ...cachedState, book_state: cachedState.book_state === 'ready' ? 'partial-cache' : cachedState.book_state }, false);
      });
    } finally { if (isMounted() && request && operations.isLatest(request)) setRefreshing(false); }
  }, [apply, enqueue, getState, isCurrent, isMounted, notice, operations, rejectSession]);

  const sessionChanged = useCallback((refreshRecords: boolean) => {
    const session = getState().session;
    const key = session ? `${session.owner_id}:${session.generation}` : '';
    if (sessionKey.current !== key) {
      sessionKey.current = key;
      operations.reset();
      cursor.current = null;
      setHasMore(false);
      reportedConflicts.current.clear();
      setOnline(false);
      setPendingDeletions([]);
      setRefreshing(false);
    }
    if (session && refreshRecords) void refresh();
  }, [getState, operations, refresh]);

  const handle = useCallback(async (action: DemoAction) => {
    const s = getState();
    const session = s.session;
    if (!session) return false;
    if (action.type === 'retry-book' || action.type === 'retry-image' || action.type === 'load-more') {
      void refresh(action.type === 'load-more');
      return true;
    }
    if (action.type === 'open-detail') {
      await apply(demoReducer(s, action));
      const request = operations.request(session);
      if (!request) return true;
      const relevant = () => operations.accepts(request) && getState().route === 'detail' && getState().selected_record_id === action.recordId;
      void fetchRecord(session.owner_id, action.recordId).then(record => enqueue(async () => {
        if (!relevant()) return;
        if (record) await apply({ ...getState(), records: getState().records.map(r => r.id === record.id ? record : r) }, false);
        else {
          await removeCachedRecord(session.owner_id, action.recordId);
          if (!relevant()) return;
          await apply(bookState({ ...getState(), route: 'book', selected_record_id: null, records: getState().records.filter(r => r.id !== action.recordId) }), false);
          notice('서버에서 삭제된 기록이에요.', 'This record was deleted on the server.');
        }
      })).catch(async error => {
        if (!relevant() || await rejectSession(error, session, relevant)) return;
        notice('최신 기록을 확인하지 못했어요. 기기에 보관한 내용을 표시합니다.', 'Could not check the latest record. Showing the copy kept on this device.');
      });
      return true;
    }
    if (action.type !== 'toggle-favorite' && action.type !== 'delete-confirm') return false;
    const record = s.records.find(r => r.id === (action.type === 'toggle-favorite' ? action.recordId : s.selected_record_id));
    if (!record) return true;
    const release = operations.acquire(session);
    if (!release) return true;
    try {
      if (action.type === 'delete-confirm') {
        await queueRecordDeletion(session.owner_id, record.id, record.version);
        reportedConflicts.current.delete(record.id);
        setPendingDeletions(ids => [...new Set([...ids, record.id])]);
      }
      await apply({ ...s, dialog: null }, false);
    } catch (error) { release(); throw error; }
    void (async () => {
      try {
        const updated = action.type === 'toggle-favorite' ? await setFavorite(record) : (await deleteRecord(session.owner_id, record.id, record.version), null);
        if (!updated) {
          await removeCachedRecord(session.owner_id, record.id);
          await removeRecordDeletion(session.owner_id, record.id);
        }
        await enqueue(async () => {
          if (!isCurrent(session)) return;
          const next = getState();
          await apply(bookState({ ...next, records: updated ? next.records.map(r => r.id === updated.id ? updated : r) : next.records.filter(r => r.id !== record.id), ...(updated ? {} : { route: 'book' as const, selected_record_id: null, drafts: { ...next.drafts, edit: next.drafts.edit?.record_id === record.id ? null : next.drafts.edit } }) }));
        });
      } catch (error) {
        if (!isCurrent(session) || await rejectSession(error, session)) return;
        notice(action.type === 'delete-confirm' ? '삭제 요청을 이 기기에 보관했어요. 연결을 확인하면 삭제를 이어갑니다.' : '서버에 반영하지 못했어요. 최신 내용을 새로고침한 뒤 다시 시도해 주세요.', action.type === 'delete-confirm' ? 'The delete request is kept on this device and will resume when connected.' : 'The change was not confirmed. Refresh and try again.');
      } finally { if (release()) void refresh(); }
    })();
    return true;
  }, [apply, enqueue, getState, isCurrent, notice, operations, refresh, rejectSession]);

  return { handle, refresh, sessionChanged, online, pendingDeletions, refreshing, hasMore };
}
