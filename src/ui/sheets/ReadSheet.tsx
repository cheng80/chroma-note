import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Sheet } from '../primitives';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { DemoRecord, DisplayLocale } from '../contract';

export function ReadSheet({ locale, record, onClose }: { locale: DisplayLocale; record: DemoRecord; onClose: () => void }) {
  const copy = getBasicCopy(locale);
  return <Sheet title={copy.read} onRequestClose={onClose} footer={<Button label={copy.close} onPress={onClose} tone="secondary" />}>
    <Text style={styles.label}>{copy.aiNote}</Text><Text style={styles.body}>{(record.fields.ai_field_note_edited ?? record.fields.ai_field_note) || (locale === 'ko' ? '아직 AI가 쓴 글이 없어요.' : 'No AI writing yet.')}</Text>
    <Text style={styles.label}>{copy.tags}</Text><Text style={styles.body}>{[...record.fields.semantic_tags, ...record.fields.mood_tags].join(', ') || (locale === 'ko' ? '없음' : 'None')}</Text>
    <Text style={styles.label}>{copy.memo}</Text><Text style={styles.body}>{record.fields.user_note || copy.noMemo}</Text>
  </Sheet>;
}

const styles = StyleSheet.create({ label: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21, fontWeight: '700' }, body: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 } });
