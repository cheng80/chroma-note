import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DisplayLocale, SheetChange, SheetState } from '../contract';
import { Palette } from '../components/Palette';
import { Button, Field, Notice, Sheet } from '../primitives';
import { recordCopy } from '../record-copy';
import { theme } from '../theme';
import { DatePlaceSheet } from './DatePlaceSheet';

type SummarySheetProps = {
  locale: DisplayLocale;
  sheet: SheetState;
  onChangeSheet: (change: SheetChange) => void;
  onApply: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRequestCaption: () => void;
};

function tags(value: string): string[] {
  return value.split(/[·,]/).map((tag) => tag.trim()).filter(Boolean);
}

function TagField({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState(() => value.join(', '));
  return <><Field label={label} value={draft} onChangeText={(text) => { setDraft(text); onChange(tags(text)); }} /><Text style={styles.hint}>{hint}</Text></>;
}

function AnalysisEditor({ locale, sheet, onChange, onRequestCaption }: {
  locale: DisplayLocale;
  sheet: Extract<SheetState, { kind: 'analysis' }>;
  onChange: (change: SheetChange) => void;
  onRequestCaption: () => void;
}) {
  const t = recordCopy[locale];
  const currentWriting = sheet.working.ai_field_note_edited ?? '';

  return <>
    <View style={styles.editorSection}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t.aiWritingSection}</Text>
      <Field label={t.aiWritingField} value={currentWriting} onChangeText={(value) => onChange({ kind: 'analysis', working: { ...sheet.working, ai_field_note_edited: value } })} multiline style={styles.writingField} />
      <Text style={styles.hint}>{t.aiWritingHint}</Text>
      {sheet.caption_status === 'error' ? <Notice message={t.suggestFailed} tone="error" /> : null}
      <Button label={sheet.caption_status === 'pending' ? t.suggesting : sheet.caption_status === 'error' ? t.suggestRetry : t.suggest} onPress={onRequestCaption} busy={sheet.caption_status === 'pending'} tone="secondary" />
    </View>
    <View style={styles.editorSection}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t.memoField}</Text>
      <Field label={t.memoField} value={sheet.working.user_note} onChangeText={(user_note) => onChange({ kind: 'analysis', working: { ...sheet.working, user_note } })} multiline style={styles.memoField} />
      <Text style={styles.hint}>{t.memoCount.replace('{count}', String(sheet.working.user_note.length))}</Text>
      <Text style={styles.auxiliary}>{t.memoHint}</Text>
    </View>
    <View style={styles.editorSection}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t.tagsSection}</Text>
      <TagField label={t.semanticTags} hint={t.semanticHint} value={sheet.working.semantic_tags} onChange={(semantic_tags) => onChange({ kind: 'analysis', working: { ...sheet.working, semantic_tags } })} />
      <TagField label={t.moodTags} hint={t.moodHint} value={sheet.working.mood_tags} onChange={(mood_tags) => onChange({ kind: 'analysis', working: { ...sheet.working, mood_tags } })} />
    </View>
    {sheet.error ? <Notice message={t.invalid} tone="error" /> : null}
    <Text style={styles.auxiliary}>{t.analysisOptional}</Text>
  </>;
}

export function SummarySheet({ locale, sheet, onChangeSheet, onApply, onCancel, onClose, onRequestCaption }: SummarySheetProps) {
  const t = recordCopy[locale];
  if (!sheet) return null;

  const footer = <><Button label={t.apply} onPress={onApply} /><Button label={t.cancel} onPress={onCancel} tone="secondary" /></>;

  if (sheet.kind === 'datePlace') return <DatePlaceSheet locale={locale} sheet={sheet} onChangeSheet={onChangeSheet} onApply={onApply} onCancel={onCancel} onClose={onClose} />;

  if (sheet.kind === 'analysis') return (
    <Sheet title={t.analysisTitle} onRequestClose={onClose} footer={footer}>
      <AnalysisEditor locale={locale} sheet={sheet} onChange={onChangeSheet} onRequestCaption={onRequestCaption} />
    </Sheet>
  );

  if (sheet.kind !== 'colors') return null;
  return (
    <Sheet title={t.colors} onRequestClose={onClose} footer={<Button label={t.close} onPress={onApply} />}>
      <Text style={styles.body}>{t.paletteBody}</Text>
      <Palette tags={sheet.value.tags} />
      <Text style={styles.auxiliary}>{t.paletteHint}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  hint: { marginTop: -theme.spacing.md, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  auxiliary: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  editorSection: { gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
  memoField: { minHeight: 240, textAlignVertical: 'top' },
  writingField: { minHeight: 100, textAlignVertical: 'top' },
});
