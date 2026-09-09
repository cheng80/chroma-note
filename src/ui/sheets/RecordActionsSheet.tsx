import React from 'react';
import { Button, Sheet } from '../primitives';
import { getBasicCopy } from '../basic-copy';
import type { DisplayLocale } from '../contract';

export function RecordActionsSheet({ locale, onClose, onEdit, onDelete, onExport, visible, onDismiss }: { locale: DisplayLocale; onClose: () => void; onEdit: () => void; onDelete: () => void; onExport: () => void; visible: boolean; onDismiss: () => void }) {
  const copy = getBasicCopy(locale);
  return <Sheet title={copy.actions} visible={visible} onDismiss={onDismiss} onRequestClose={onClose} footer={<Button label={copy.cancel} onPress={onClose} tone="secondary" />}><Button label={locale === 'ko' ? '내보내기' : 'Export image'} onPress={onExport} /><Button label={copy.edit} onPress={onEdit} tone="secondary" /><Button label={copy.delete} onPress={onDelete} tone="destructive" /></Sheet>;
}
