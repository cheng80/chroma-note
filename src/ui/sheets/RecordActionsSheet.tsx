import React from 'react';
import { Button, Sheet } from '../primitives';
import { getBasicCopy } from '../basic-copy';
import type { DisplayLocale } from '../contract';

export function RecordActionsSheet({ locale, onClose, onEdit, onDelete, onExport, visible, exportDisabled = false, onDismiss, restoreFocusRef }: { locale: DisplayLocale; onClose: () => void; onEdit: () => void; onDelete: () => void; onExport: () => void; visible: boolean; exportDisabled?: boolean; onDismiss: () => void; restoreFocusRef?: React.RefObject<unknown | null> }) {
  const copy = getBasicCopy(locale);
  return <Sheet title={copy.actions} closeLabel={copy.close} visible={visible} onDismiss={onDismiss} onRequestClose={onClose} restoreFocusRef={restoreFocusRef} footer={<Button label={copy.cancel} onPress={onClose} tone="secondary" />}><Button label={locale === 'ko' ? '내보내기' : 'Export image'} onPress={onExport} disabled={exportDisabled} /><Button label={copy.edit} onPress={onEdit} tone="secondary" /><Button label={copy.delete} onPress={onDelete} tone="destructive" /></Sheet>;
}
