import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DisplayLocale, SheetChange, SheetState } from '../contract';
import { Palette } from '../components/Palette';
import { SemanticText } from '../components/SemanticText';
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
  restoreFocusRef?: React.RefObject<unknown | null>;
};

function tags(value: string): string[] {
  return value.split(/[·,]/).map((tag) => tag.trim()).filter(Boolean);
}

function TagField({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState(() => value.join(', '));
  return <><Field label={label} value={draft} onChangeText={(text) => { setDraft(text); onChange(tags(text)); }} /><SemanticText style={styles.hint}>{hint}</SemanticText></>;
}

function AnalysisEditor({ locale, sheet, onChange, onRequestCaption }: {
  locale: DisplayLocale;
  sheet: Extract<SheetState, { kind: 'analysis' }>;
  onChange: (change: SheetChange) => void;
  onRequestCaption: () => void;
}) {
  const t = recordCopy[locale];
  return <>
    <View style={styles.editorSection}>
      <Field label={t.memoField} value={sheet.working.user_note} onChangeText={(user_note) => onChange({ kind: 'analysis', working: { ...sheet.working, user_note } })} multiline style={styles.memoField} />
      <Text style={styles.hint}>{t.memoCount.replace('{count}', String([...sheet.working.user_note].length))}</Text>
      <SemanticText style={styles.auxiliary}>{t.memoHint}</SemanticText>
      <SemanticText style={[styles.auxiliary, styles.aiDisclaimer]}>{t.aiWritingHint}</SemanticText>
      {sheet.caption_status === 'error' ? <Notice message={t.suggestFailed} tone="error" /> : null}
      <Button label={sheet.caption_status === 'pending' ? t.suggesting : sheet.caption_status === 'error' ? t.suggestRetry : t.suggest} onPress={onRequestCaption} busy={sheet.caption_status === 'pending'} tone="secondary" />
    </View>
    <View style={styles.editorSection}>
      <Field label={t.sceneField} value={sheet.working.scene ?? ''} onChangeText={(value) => onChange({ kind: 'analysis', working: { ...sheet.working, scene: value || null } })} />
      <Text style={styles.hint}>{t.sceneCount.replace('{count}', String([...(sheet.working.scene ?? '')].length))}</Text>
      <SemanticText style={styles.auxiliary}>{t.sceneHint}</SemanticText>
    </View>
    <View style={styles.editorSection}>
      <SemanticText accessibilityRole="header" style={styles.sectionTitle}>{t.tagsSection}</SemanticText>
      <TagField label={t.semanticTags} hint={t.semanticHint} value={sheet.working.semantic_tags} onChange={(semantic_tags) => onChange({ kind: 'analysis', working: { ...sheet.working, semantic_tags } })} />
      <TagField label={t.moodTags} hint={t.moodHint} value={sheet.working.mood_tags} onChange={(mood_tags) => onChange({ kind: 'analysis', working: { ...sheet.working, mood_tags } })} />
    </View>
    {sheet.error ? <Notice message={t.invalid} tone="error" /> : null}
    <SemanticText style={styles.auxiliary}>{t.analysisOptional}</SemanticText>
  </>;
}

export function SummarySheet({ locale, sheet, onChangeSheet, onApply, onCancel, onClose, onRequestCaption, restoreFocusRef }: SummarySheetProps) {
  const t = recordCopy[locale];
  if (!sheet) return null;

  const footer = <><Button label={t.apply} onPress={onApply} /><Button label={t.cancel} onPress={onCancel} tone="secondary" /></>;

  if (sheet.kind === 'datePlace') return <DatePlaceSheet locale={locale} sheet={sheet} onChangeSheet={onChangeSheet} onApply={onApply} onCancel={onCancel} onClose={onClose} restoreFocusRef={restoreFocusRef} />;

  if (sheet.kind === 'analysis') return (
    <Sheet title={t.analysisTitle} closeLabel={t.close} restoreFocusRef={restoreFocusRef} onRequestClose={onClose} footer={footer}>
      <AnalysisEditor locale={locale} sheet={sheet} onChange={onChangeSheet} onRequestCaption={onRequestCaption} />
    </Sheet>
  );

  if (sheet.kind !== 'colors') return null;
  return (
    <Sheet title={t.colors} closeLabel={t.close} restoreFocusRef={restoreFocusRef} onRequestClose={onClose} footer={<Button label={t.close} onPress={onApply} />}>
      <SemanticText style={styles.body}>{t.paletteBody}</SemanticText>
      <Palette tags={sheet.value.tags} />
      <SemanticText style={styles.auxiliary}>{t.paletteHint}</SemanticText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  hint: { marginTop: -theme.spacing.md, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  aiDisclaimer: { color: theme.colors.info },
  auxiliary: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  editorSection: { gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
  memoField: { minHeight: 240, textAlignVertical: 'top' },
});
