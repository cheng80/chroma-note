import { useCallback } from 'react';
import { Alert } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { abortSave, fetchRecord, saveRecord } from '../../services/records';
import { acceptSavedRecord, bookState } from '../app-state';
import { demoReducer, discardSaveMode, isSaveableDraft, type DemoAction } from '../demo-state';
import { recordWriting } from '../record-writing';
import type { ControllerStore } from './controller-store';
import type { RecordOperations } from './record-operations';
import type { RejectRecordSession } from './useSessionWorkflow';

export function useRecordSaving(store: ControllerStore, operations: RecordOperations, rejectSession: RejectRecordSession, refresh: () => Promise<void>, finishLogout: () => Promise<void>, online: boolean) {
  const { getState, apply, enqueue, isCurrent, notice } = store;

  const runSave = useCallback(async () => {
    const s = getState();
    const attempt = s.save_attempt;
    const session = s.session;
    if (!attempt || !session) return false;
    const release = operations.acquire(session);
    if (!release) return false;
    let saved = false;
    try {
      const record = await saveRecord(attempt, () => isCurrent(session));
      await enqueue(async () => {
        if (!isCurrent(session)) return;
        const next = acceptSavedRecord(getState(), attempt.operation_id, record);
        if (next !== getState()) { await apply(next); saved = true; }
      });
      return saved && isCurrent(session);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      await enqueue(async () => {
        const next = getState();
        if (!isCurrent(session) || next.save_attempt?.operation_id !== attempt.operation_id) return;
        await apply({ ...next, save_attempt: { ...next.save_attempt, state: code === 'conflict' ? 'conflict' : ['validation', 'forbidden', 'not_found', 'image_missing'].includes(code) ? 'failed' : 'uncertain', error_code: code === 'not_found' ? 'not_found' : code === 'conflict' ? 'conflict' : 'save_uncertain' } });
      });
      if (!isCurrent(session) || await rejectSession(error, session, () => getState().save_attempt?.operation_id === attempt.operation_id)) return false;
      if (code === 'conflict') notice('다른 기기에서 수정된 기록이에요. 내 초안은 보관했습니다. 최신 기록을 확인한 뒤 다시 편집해 주세요.', 'The record changed on another device. Your draft is kept. Review the latest record before editing again.');
      return false;
    } finally { if (release() && saved && !operations.savingForLogout()) void refresh(); }
  }, [apply, enqueue, getState, isCurrent, notice, operations, refresh, rejectSession]);

  const handle = useCallback(async (action: DemoAction) => {
    const s = getState();
    const session = s.session;
    if (!session) return false;
    if (action.type === 'logout-save') {
      const drafts = Object.values(s.drafts).filter(draft => draft !== null);
      if (!online || !drafts.length || !drafts.every(isSaveableDraft)) return true;
      const releaseBatch = operations.reserveLogout(session);
      if (!releaseBatch) return true;
      const pendingDraftId = s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state) ? s.save_attempt.draft_id : null;
      drafts.sort((a, b) => Number(b.draft_id === pendingDraftId) - Number(a.draft_id === pendingDraftId));
      await apply({ ...s, dialog: null }, false);
      void (async () => {
        try {
          for (const draft of drafts) {
            if (!isCurrent(session)) return;
            let prepared = false;
            await enqueue(async () => {
              if (!isCurrent(session)) return;
              const latest = { ...getState(), route: 'summary' as const, active_draft_kind: draft.kind };
              const attempt = latest.save_attempt;
              if (attempt && !['saved', 'demo_saved'].includes(attempt.state) && attempt.draft_id === draft.draft_id) {
                await apply({ ...latest, save_attempt: { ...attempt, state: 'pending' } });
              } else {
                if (attempt && !['saved', 'demo_saved'].includes(attempt.state)) throw new Error('Another draft save is pending.');
                const next = demoReducer(latest, { type: 'save' });
                if (!next.save_attempt || next.save_attempt === attempt) throw new Error('Draft is not ready.');
                await apply({ ...next, save_attempt: { ...next.save_attempt, operation_id: randomUUID(), payload_snapshot: { ...next.save_attempt.payload_snapshot, locale: latest.locale } } });
              }
              prepared = true;
            });
            if (!prepared || !isCurrent(session) || !await runSave()) return;
          }
          if (isCurrent(session)) await finishLogout();
        } finally { releaseBatch(); }
      })();
      return true;
    }
    if (action.type === 'logout' || action.type === 'logout-confirm') {
      if (action.type === 'logout' && (s.drafts.new || s.drafts.edit)) {
        await apply({ ...s, dialog: { kind: 'logout', step: 'discard' } }, false);
        return true;
      }
      const release = operations.acquire(session);
      if (release) void finishLogout().finally(release);
      return true;
    }
    if (action.type === 'discard-save-confirm') {
      const id = s.dialog?.kind === 'discard-save' ? s.dialog.draft_id : null;
      const draft = Object.values(s.drafts).find(item => item?.draft_id === id);
      const attempt = s.save_attempt?.draft_id === id ? s.save_attempt : null;
      const mode = attempt ? discardSaveMode(attempt, draft) : 'local';
      if (!draft || !mode) return true;
      if (!attempt) {
        await apply(demoReducer(s, { type: 'discard-save-result', draftId: draft.draft_id, outcome: 'success' }));
        return true;
      }
      const release = operations.acquire(session);
      if (!release) return true;
      await apply({ ...s, dialog: null }, false);
      void (async () => {
        try {
          let refreshedRecord = null;
          if (mode === 'abort') {
            try { await abortSave(attempt, () => isCurrent(session)); }
            catch (error) {
              if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'conflict') throw error;
              const record = await fetchRecord(session.owner_id, attempt.record_id);
              if (record) await enqueue(async () => {
                if (isCurrent(session)) await apply({ ...getState(), records: [record, ...getState().records.filter(item => item.id !== record.id)] }, false);
              });
              throw error;
            }
          } else if (attempt.state === 'uncertain') {
            refreshedRecord = await fetchRecord(session.owner_id, attempt.record_id);
          }
          await enqueue(async () => {
            if (!isCurrent(session)) return;
            const discarded = demoReducer(getState(), { type: 'discard-save-result', draftId: draft.draft_id, operationId: attempt.operation_id, outcome: 'success' });
            await apply(refreshedRecord ? bookState({ ...discarded, records: [refreshedRecord, ...discarded.records.filter(record => record.id !== refreshedRecord.id)] }) : discarded);
          });
        } catch (error) {
          await enqueue(async () => {
            if (isCurrent(session)) await apply(demoReducer(getState(), { type: 'discard-save-result', draftId: draft.draft_id, operationId: attempt.operation_id, outcome: 'failed' }), false);
          });
          const relevant = () => getState().save_attempt?.operation_id === attempt.operation_id;
          if (!isCurrent(session) || !relevant() || await rejectSession(error, session, relevant)) return;
          const readyMayExist = error && typeof error === 'object' && 'code' in error && error.code === 'conflict';
          notice(readyMayExist ? '서버에 기록이 저장됐을 수 있어 초안을 폐기하지 않았어요. 다시 저장을 눌러 결과를 확인해 주세요. 사진과 입력은 그대로예요.' : '서버 상태를 확인하지 못해 초안을 폐기하지 않았어요. 사진과 입력은 그대로예요.', readyMayExist ? 'The record may already be saved, so the draft was not discarded. Choose Save again to confirm the result. Your photo and input are unchanged.' : 'The server state could not be confirmed, so the draft was not discarded. Your photo and input are unchanged.');
        } finally { if (release()) void refresh(); }
      })();
      return true;
    }
    if (action.type !== 'save' && action.type !== 'retry-save') return false;
    if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state)) {
      if (s.save_attempt.state === 'conflict' || (s.save_attempt.state === 'failed' && s.save_attempt.base_version !== undefined)) {
        const attempt = s.save_attempt;
        const relevant = () => isCurrent(session) && getState().save_attempt?.operation_id === attempt.operation_id;
        void fetchRecord(session.owner_id, attempt.record_id).then(record => {
          if (!relevant()) return;
          if (!record) { notice('삭제된 기록이라 저장할 수 없어요. 내 편집 초안은 유지됩니다.', 'This record was deleted. Your edit draft is kept.'); return; }
          const ko = getState().locale === 'ko';
          Alert.alert(ko ? '최신 기록에 내 편집을 적용할까요?' : 'Apply your edits to the latest record?', ko ? `서버의 최신 메모: ${recordWriting(record.fields) || '(없음)'}\n\n내 편집을 유지하면 최신 버전을 기준으로 다시 검토한 뒤 저장합니다.` : `Latest note: ${recordWriting(record.fields) || '(empty)'}\n\nKeep your edits and review them against the latest version before saving.`, [
            { text: ko ? '취소' : 'Cancel', style: 'cancel' },
            { text: ko ? '내 편집 유지' : 'Keep my edits', onPress: () => void enqueue(async () => {
              const latest = getState();
              if (!relevant() || !latest.drafts.edit) return;
              await apply({ ...latest, route: 'summary', active_draft_kind: 'edit', save_attempt: null, records: latest.records.map(r => r.id === record.id ? record : r), drafts: { ...latest.drafts, edit: { ...latest.drafts.edit, stage: 'summary', base_record_version: record.version, operation_id: undefined, selected_candidate: record.stamp } } });
            }) },
          ]);
        }).catch(async error => {
          if (!relevant() || await rejectSession(error, session, relevant)) return;
          notice('최신 기록을 불러오지 못했어요. 초안은 유지됩니다.', 'Could not load the latest record. Your draft is kept.');
        });
        return true;
      }
      await apply({ ...s, save_attempt: { ...s.save_attempt, state: 'pending' } });
    } else {
      const next = demoReducer(s, { type: 'save' });
      if (!next.save_attempt || next.save_attempt === s.save_attempt) return true;
      const operation_id = randomUUID();
      const kind = next.active_draft_kind!;
      await apply({ ...next, save_attempt: { ...next.save_attempt, operation_id, payload_snapshot: { ...next.save_attempt.payload_snapshot, locale: s.locale } }, drafts: { ...next.drafts, [kind]: { ...next.drafts[kind]!, operation_id } } });
    }
    void runSave();
    return true;
  }, [apply, enqueue, finishLogout, getState, isCurrent, notice, online, operations, refresh, rejectSession, runSave]);

  return { handle };
}
