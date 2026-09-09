import React from 'react';
import Reanimated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import type { RecordSummaryScreenProps, SaveAttempt } from '../contract';
import { RecordArtwork } from '../components/RecordArtwork';
import { AppIcon } from '../components/AppIcon';
import { useEntranceProgress } from '../components/motion';
import { Button, IconButton, Notice, Screen, SummaryRow } from '../primitives';
import { displayDate, fillCount, imageSource, recordCopy } from '../record-copy';
import { SummarySheet } from '../sheets/SummarySheet';
import { theme } from '../theme';

function isSaving(attempt: SaveAttempt | null): boolean {
  return attempt?.state === 'pending' || attempt?.state === 'uploading' || attempt?.state === 'finalizing';
}

function OneLine({ children }: { children: string }) {
  return <Text numberOfLines={1} ellipsizeMode="tail" style={styles.rowValue}>{children}</Text>;
}

export function RecordSummaryScreen({ locale, images, draft, sheet, save_attempt, blocking_reason, onBack, onClose, onOpenSheet, onChangeSheet, onApplySheet, onCancelSheet, onRequestCloseSheet, onRequestCaption, onSave, onRetrySave }: RecordSummaryScreenProps) {
  const t = recordCopy[locale];
  const busy = isSaving(save_attempt);
  const saveFailed = save_attempt?.state === 'failed' || save_attempt?.state === 'uncertain' || save_attempt?.state === 'conflict';
  const source = draft.selected_candidate ? imageSource(draft.selected_candidate.local_uri, images.stamp) : images.stamp;
  const writing = draft.fields.ai_field_note_edited || draft.fields.ai_field_note || t.writingEmpty;
  const tags = [...draft.fields.semantic_tags, ...draft.fields.mood_tags].join(' · ');
  const writingSummary = tags ? `${writing} · ${tags}` : writing;
  const datePlace = draft.fields.diary_date ? `${displayDate(draft.fields.diary_date)}${draft.fields.place_name ? ` · ${draft.fields.place_name}` : ''}` : t.dateEmpty;
  const { progress, reduceMotion } = useEntranceProgress(true);
  const resultStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : interpolate(progress.value, [0, 1], [6, 0]) }],
  }));

  const footer = <>{blocking_reason ? <Notice message={blocking_reason} tone="warning" /> : null}{saveFailed ? <Notice message={t.error} tone="error" /> : null}{saveFailed ? <Button label={t.saveRetry} onPress={onRetrySave} tone="secondary" /> : null}<Text style={styles.saveHint}>{t.saveHint}</Text><Button label={busy ? t.saving : t.save} onPress={onSave} busy={busy} disabled={Boolean(blocking_reason) || busy} /></>;

  return (
    <>
      <Screen title={t.summaryHeader} onBack={onBack} backLabel={t.back} actions={<IconButton label={t.close} onPress={onClose}><AppIcon name="x" /></IconButton>} footer={footer} contentStyle={styles.content}>
        <Reanimated.View style={[styles.result, resultStyle]}>
          <View style={styles.confirmedRow}><AppIcon name="check" size={16} color={theme.colors.success} /><Text style={styles.confirmed}>{t.summaryConfirmed}</Text></View>
          <RecordArtwork fields={draft.fields} source={source} locale={locale} />
        </Reanimated.View>
        <SummaryRow label={t.writing} value={<OneLine>{writingSummary}</OneLine>} onPress={() => onOpenSheet('analysis')} />
        <SummaryRow label={t.memo} value={<OneLine>{draft.fields.user_note || t.memoEmpty}</OneLine>} onPress={() => onOpenSheet('memo')} />
        <SummaryRow label={t.datePlace} value={<OneLine>{datePlace}</OneLine>} onPress={() => onOpenSheet('datePlace')} />
        <SummaryRow label={t.colors} value={<OneLine>{draft.colors ? fillCount(t.colorsValue, draft.colors.tags.length) : t.colorsEmpty}</OneLine>} onPress={draft.colors ? () => onOpenSheet('colors') : undefined} />
      </Screen>
      <SummarySheet locale={locale} sheet={sheet} onChangeSheet={onChangeSheet} onApply={onApplySheet} onCancel={onCancelSheet} onClose={onRequestCloseSheet} onRequestCaption={onRequestCaption} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.sm, gap: 0 },
  result: { paddingVertical: theme.spacing.sm, gap: theme.spacing.lg },
  confirmed: { color: theme.colors.success, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  rowValue: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 16, lineHeight: 24 },
  saveHint: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
});
