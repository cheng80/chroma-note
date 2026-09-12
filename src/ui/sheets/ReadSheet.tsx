import { SemanticText } from '../components/SemanticText';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Sheet } from '../primitives';
import { getBasicCopy } from '../basic-copy';
import { recordCopy } from '../record-copy';
import { recordWriting } from '../record-writing';
import { theme } from '../theme';
import type { DemoRecord, DisplayLocale } from '../contract';

export function ReadSheet({ locale, record, onClose, restoreFocusRef }: { locale: DisplayLocale; record: DemoRecord; onClose: () => void; restoreFocusRef?: React.RefObject<unknown | null> }) {
  const copy = getBasicCopy(locale);
  return <Sheet title={copy.read} closeLabel={copy.close} restoreFocusRef={restoreFocusRef} onRequestClose={onClose} footer={<Button label={copy.close} onPress={onClose} tone="secondary" />}>
    <SemanticText style={styles.label}>{recordCopy[locale].memoField}</SemanticText><SemanticText style={styles.body}>{recordWriting(record.fields) || recordCopy[locale].writingEmpty}</SemanticText>
    <SemanticText style={styles.label}>{copy.tags}</SemanticText><Text style={styles.body}>{[...record.fields.semantic_tags, ...record.fields.mood_tags].join(', ') || (locale === 'ko' ? '없음' : 'None')}</Text>
  </Sheet>;
}

const styles = StyleSheet.create({ label: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21, fontWeight: '700' }, body: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 } });
