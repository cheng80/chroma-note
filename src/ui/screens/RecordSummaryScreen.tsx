import React, { useRef } from 'react';
import Reanimated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import type { RecordSummaryScreenProps, SaveAttempt } from '../contract';
import { RecordArtwork } from '../components/RecordArtwork';
import { SemanticText } from '../components/SemanticText';
import { AppIcon } from '../components/AppIcon';
import { useEntranceProgress } from '../components/motion';
import { Button, IconButton, Notice, Screen, SummaryRow } from '../primitives';
import { displayDate, fillCount, imageSource, recordCopy } from '../record-copy';
import { recordWriting } from '../record-writing';
import { SummarySheet } from '../sheets/SummarySheet';
import { theme } from '../theme';

function isSaving(attempt: SaveAttempt | null): boolean {
  return attempt?.state === 'pending' || attempt?.state === 'uploading' || attempt?.state === 'finalizing';
}

function saveFailureMessage(attempt: SaveAttempt | null, locale: RecordSummaryScreenProps['locale']) {
  if (attempt?.state === 'conflict') return locale === 'ko' ? '다른 기기에서 기록이 변경됐어요. 초안은 이 기기에 보관했어요.' : 'This record changed on another device. Your draft is kept on this device.';
  if (attempt?.error_code === 'not_found') return locale === 'ko' ? '저장 서버에서 요청을 처리할 수 없어요. 초안과 컬러 스케치는 이 기기에 보관했어요.' : 'The save server could not process this request. Your draft and color sketch are kept on this device.';
  return locale === 'ko' ? '저장 결과를 확인하지 못했어요. 초안과 컬러 스케치는 이 기기에 보관했어요.' : 'The save result could not be confirmed. Your draft and color sketch are kept on this device.';
}

function OneLine({ children }: { children: string }) {
  return <Text numberOfLines={1} ellipsizeMode="tail" style={styles.rowValue}>{children}</Text>;
}

export function RecordSummaryScreen({ locale, images, draft, sheet, save_attempt, blocking_reason, onBack, onClose, onOpenSheet, onChangeSheet, onApplySheet, onCancelSheet, onRequestCloseSheet, onRequestCaption, onSave, onRetrySave, onDiscardSave, discardSaveTriggerRef }: RecordSummaryScreenProps) {
  const t = recordCopy[locale];
  const analysisRef = useRef<View>(null);
  const datePlaceRef = useRef<View>(null);
  const colorsRef = useRef<View>(null);
  const sheetRestoreRef = useRef<View>(null);
  const openSheet = (kind: 'analysis' | 'datePlace' | 'colors', ref: React.RefObject<View | null>) => { sheetRestoreRef.current = ref.current; onOpenSheet(kind); };
  const editing = draft.base_record_version !== undefined;
  const title = editing ? locale === 'ko' ? '기록 편집' : 'Edit record' : t.summaryHeader;
  const saveLabel = editing ? locale === 'ko' ? '변경 저장' : 'Save changes' : t.save;
  const saveHint = editing ? locale === 'ko' ? '수정한 글과 날짜를 저장해요. 컬러 스케치와 대표색은 유지돼요.' : 'Save your writing and date changes. The color sketch and colors stay the same.' : t.saveHint;
  const busy = isSaving(save_attempt);
  const saveFailed = save_attempt?.state === 'failed' || save_attempt?.state === 'uncertain' || save_attempt?.state === 'conflict';
  const canEdit = !save_attempt || save_attempt.state === 'saved' || save_attempt.state === 'demo_saved';
  const source = draft.selected_candidate ? imageSource(draft.selected_candidate.local_uri, images.stamp, draft.selected_candidate.image_headers) : images.stamp;
  const tagCount = draft.fields.semantic_tags.length + draft.fields.mood_tags.length;
  const writingSummary = recordWriting(draft.fields)
    || (tagCount ? locale === 'ko' ? `태그 ${tagCount}개` : `${tagCount} tags` : '')
    || t.writingEmpty;
  const datePlace = draft.fields.diary_date ? `${displayDate(draft.fields.diary_date)}${draft.fields.place_name ? `, ${draft.fields.place_name}` : ''}` : t.dateEmpty;
  const { progress, reduceMotion } = useEntranceProgress(true);
  const resultStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : interpolate(progress.value, [0, 1], [6, 0]) }],
  }));

  const footer = saveFailed ? <>
    <Notice message={saveFailureMessage(save_attempt, locale)} tone="error" />
    <Button label={locale === 'ko' ? '다시 저장' : 'Save again'} onPress={onRetrySave} />
    <Button label={locale === 'ko' ? '초안으로 나가기' : 'Leave and keep draft'} onPress={onClose} tone="secondary" />
    <Button ref={discardSaveTriggerRef} label={locale === 'ko' ? '초안 폐기' : 'Discard draft'} onPress={onDiscardSave} tone="subtle" />
  </> : <>
    {blocking_reason && !busy ? <Notice message={blocking_reason} tone="warning" /> : null}
    <SemanticText style={styles.saveHint}>{saveHint}</SemanticText>
    <Button label={busy ? t.saving : saveLabel} onPress={onSave} busy={busy} disabled={Boolean(blocking_reason) || busy} />
  </>;

  return (
    <>
      <Screen title={title} onBack={canEdit ? onBack : undefined} backLabel={t.back} actions={canEdit ? <IconButton label={t.close} onPress={onClose}><AppIcon name="x" /></IconButton> : undefined} footer={footer} contentStyle={styles.content}>
        <Reanimated.View style={[styles.result, resultStyle]}>
          <View style={styles.confirmedRow}><AppIcon name="check" size={16} color={theme.colors.success} /><SemanticText style={styles.confirmed}>{t.summaryConfirmed}</SemanticText></View>
          <RecordArtwork fields={draft.fields} source={source} locale={locale} aspectRatio={draft.selected_candidate ? draft.selected_candidate.width / draft.selected_candidate.height : 1} />
        </Reanimated.View>
        <SummaryRow ref={analysisRef} label={t.writing} value={<OneLine>{writingSummary}</OneLine>} onPress={canEdit ? () => openSheet('analysis', analysisRef) : undefined} />
        <SummaryRow ref={datePlaceRef} label={t.datePlace} value={<OneLine>{datePlace}</OneLine>} onPress={canEdit ? () => openSheet('datePlace', datePlaceRef) : undefined} />
        <SummaryRow ref={colorsRef} label={t.colors} value={<OneLine>{draft.colors ? fillCount(t.colorsValue, draft.colors.tags.length) : t.colorsEmpty}</OneLine>} onPress={canEdit && draft.colors ? () => openSheet('colors', colorsRef) : undefined} />
      </Screen>
      <SummarySheet restoreFocusRef={sheetRestoreRef} locale={locale} sheet={sheet} onChangeSheet={onChangeSheet} onApply={onApplySheet} onCancel={onCancelSheet} onClose={onRequestCloseSheet} onRequestCaption={onRequestCaption} />
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
