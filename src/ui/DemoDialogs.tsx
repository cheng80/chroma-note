import React, { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { ConfirmDialog } from './primitives';
import type { DemoScenario, DialogState, DisplayLocale } from './contract';
import type { DemoAction } from './demo-state';

type DemoDialogsProps = {
  locale: DisplayLocale;
  dialog: DialogState;
  scenario: DemoScenario;
  send: (action: DemoAction) => void;
};

type DiscardDraftDialogProps = {
  ko: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function DiscardDraftDialog({ ko, onConfirm, onCancel }: DiscardDraftDialogProps) {
  const shown = useRef(false);
  const title = ko ? '변경을 버릴까요?' : 'Discard changes?';
  const message = ko ? '저장하지 않은 변경 내용은 사라져요.' : 'Unsaved changes will be discarded.';
  const confirmLabel = ko ? '버리기' : 'Discard';
  const cancelLabel = ko ? '취소' : 'Cancel';

  useEffect(() => {
    if (Platform.OS === 'web' || shown.current) return;
    shown.current = true;
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: onCancel },
        { text: confirmLabel, style: 'destructive', onPress: onConfirm },
      ],
      { cancelable: true, onDismiss: onCancel },
    );
  }, [cancelLabel, confirmLabel, message, onCancel, onConfirm, title]);

  if (Platform.OS !== 'web') return null;
  return <ConfirmDialog title={title} message={message} confirmLabel={confirmLabel} cancelLabel={cancelLabel} destructive onConfirm={onConfirm} onCancel={onCancel} />;
}

export function DemoDialogs({ locale, dialog, scenario, send }: DemoDialogsProps) {
  if (!dialog) return null;
  const ko = locale === 'ko';
  const cancelLabel = ko ? '취소' : 'Cancel';
  if (dialog.kind === 'adopt-candidate') return <ConfirmDialog title={ko ? '이 후보를 사용할까요?' : 'Use this candidate?'} message={ko ? '새 후보를 채택하면 다시 확인해야 해요.' : 'You will need to confirm the new candidate again.'} confirmLabel={ko ? '사용하기' : 'Use candidate'} cancelLabel={cancelLabel} onConfirm={() => send({ type: 'adopt-confirm', candidateId: dialog.candidate_id })} onCancel={() => send({ type: 'adopt-cancel' })} />;
  if (dialog.kind === 'delete-record') return <ConfirmDialog title={ko ? '기록을 삭제할까요?' : 'Delete this record?'} message={ko ? '삭제한 기록은 되돌릴 수 없어요.' : 'A deleted record cannot be restored.'} confirmLabel={ko ? '기록 삭제' : 'Delete record'} cancelLabel={cancelLabel} destructive onConfirm={() => send({ type: 'delete-confirm' })} onCancel={() => send({ type: 'delete-cancel' })} />;
  if (dialog.kind === 'delete-account') return <ConfirmDialog title={ko ? '계정을 삭제할까요?' : 'Delete your account?'} message={ko ? '계정과 저장 기록을 삭제하면 되돌릴 수 없어요.' : 'Your account and saved records cannot be restored after deletion.'} confirmLabel={ko ? '계정 삭제' : 'Delete account'} cancelLabel={cancelLabel} destructive onConfirm={() => send({ type: 'delete-account-result', outcome: scenario === 'account-delete-failed' ? 'failed' : 'success' })} onCancel={() => send({ type: 'delete-account-cancel' })} />;
  if (dialog.kind === 'replace-photo') return <ConfirmDialog title={ko ? '사진을 바꿀까요?' : 'Replace the photo?'} message={ko ? '현재 사진으로 만든 미저장 결과는 초기화돼요.' : 'The unsaved result made from this photo will be reset.'} confirmLabel={ko ? '사진 바꾸기' : 'Replace photo'} cancelLabel={cancelLabel} destructive onConfirm={() => send({ type: 'replace-photo-confirm' })} onCancel={() => send({ type: 'replace-photo-cancel' })} />;
  if (dialog.kind === 'logout') return <ConfirmDialog title={ko ? '로그아웃할까요?' : 'Log out?'} message={ko ? '미저장 작업은 이 기기에서 삭제돼요.' : 'Unsaved work will be removed from this device.'} confirmLabel={ko ? '로그아웃' : 'Log out'} cancelLabel={cancelLabel} destructive onConfirm={() => send({ type: 'logout-confirm' })} onCancel={() => send({ type: 'logout-cancel' })} />;
  return <DiscardDraftDialog ko={ko} onConfirm={() => send({ type: 'sheet-discard-confirm' })} onCancel={() => send({ type: 'sheet-discard-cancel' })} />;
}
