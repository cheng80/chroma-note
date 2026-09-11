import React from 'react';
import { ImageSourcePropType, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, Notice, StampImage } from '../primitives';
import { FilterChip } from '../components/FilterChip';
import { RecordCard } from '../components/RecordCard';
import { AppIcon } from '../components/AppIcon';
import { FilterSheet } from '../sheets/FilterSheet';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import { SemanticText } from '../components/SemanticText';
import { displayDate, imageSource as sourceFor } from '../record-copy';
import type { BookFilter, BookScreenProps, DemoRecord, DisplayLocale, SaveAttempt, SheetChange, SheetState } from '../contract';

const designStamp = require('../../../design/images/generated-1788887279815.png') as ImageSourcePropType;

function recordTitle(record: DemoRecord, locale: DisplayLocale) {
  return record.fields.user_note.trim() || record.fields.place_name?.trim() || (locale === 'ko' ? '기록' : 'Record');
}

function recordCountLabel(count: number, locale: DisplayLocale) {
  return locale === 'ko' ? `${count}개의 기록` : `${count} record${count === 1 ? '' : 's'}`;
}

function SaveAttemptNotice({ locale, attempt }: { locale: DisplayLocale; attempt: SaveAttempt | null }) {
  if (attempt?.state === 'pending' || attempt?.state === 'uploading' || attempt?.state === 'finalizing') return <Notice message={locale === 'ko' ? '저장 결과를 확인하는 중이에요.' : 'Checking the save result.'} tone="info" busy />;
  if (attempt?.state === 'uncertain') return <Notice message={locale === 'ko' ? '저장 결과를 확인하지 못했어요. 초안은 보관했어요.' : 'The save result could not be confirmed. Your draft is kept.'} tone="warning" />;
  if (attempt?.state === 'conflict') return <Notice message={locale === 'ko' ? '다른 기기에서 변경된 기록이에요. 초안을 열어 최신 내용과 다시 확인해 주세요.' : 'This record changed on another device. Open the draft to review the latest version.'} tone="warning" />;
  if (attempt?.state === 'failed') return <Notice message={locale === 'ko' ? '저장하지 못한 초안을 보관했어요. 초안을 열어 다시 확인해 주세요.' : 'The unsaved draft is kept. Open it to review and try again.'} tone="warning" />;
  return null;
}

function EmptyBook({ locale, drafts, save_attempt, onOpenSettings, onStartRecord, onResumeDraft, onRetry, refreshing }: Pick<BookScreenProps, 'locale' | 'drafts' | 'save_attempt' | 'onOpenSettings' | 'onStartRecord' | 'onResumeDraft' | 'onRetry' | 'refreshing'>) {
  const copy = getBasicCopy(locale);
  const draft = drafts[0];
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <ScrollView refreshControl={<RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRetry} />} contentContainerStyle={styles.emptyContent} showsVerticalScrollIndicator={false}>
      <View style={styles.brandHeader}><Text accessibilityRole="header" style={styles.brand}>{copy.brand}</Text><IconButton label={copy.settings} onPress={onOpenSettings}><AppIcon name="settings" size={20} color={theme.colors.ink} /></IconButton></View>
      <View style={styles.emptyExample}><StampImage source={designStamp} accessibilityLabel={copy.designExample} style={styles.emptyImage} /><Text style={styles.emptyCaption}>{copy.designExample}</Text></View>
      <SemanticText accessibilityRole="header" style={styles.emptyHeading}>{copy.emptyTitle}</SemanticText>
      <SemanticText style={styles.emptyBody}>{copy.emptyBody}</SemanticText>
      <SaveAttemptNotice locale={locale} attempt={save_attempt} />
      <Button label={copy.importPhoto} onPress={onStartRecord} />
      {draft ? <Button label={copy.resume(1)} onPress={() => onResumeDraft(draft.draft_id)} tone="subtle" /> : null}
      <SemanticText style={styles.caption}>{copy.emptyHint}</SemanticText>
    </ScrollView>
  </SafeAreaView>;
}

function activeFilter(filter: BookFilter) { return Boolean(filter.start_date || filter.end_date || filter.semantic_tag || filter.favorite_only); }

export function BookScreen({ locale, session: _session, images, records, drafts, filter, list_state, model_status: _modelStatus, save_attempt, sheet, has_more, refreshing, onOpenSettings, onStartRecord, onResumeDraft, onOpenRecord, onToggleFavorite, onOpenFilter, onChangeSheet, onApplySheet, onCancelSheet, onRequestCloseSheet, onLoadMore, onRetry }: BookScreenProps) {
  const copy = getBasicCopy(locale);
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale >= 1.5 || width < 360 ? 1 : width >= 760 ? Math.min(4, Math.max(3, Math.floor((width - 28) / 240))) : 2;
  const cardWidth = (width - 40 - 12 * (columns - 1)) / columns;
  const filterSheet = sheet?.kind === 'filter' ? sheet : null;
  const isActive = activeFilter(filter);
  const draft = drafts[0];
  const showRecordCount = list_state === 'ready' || list_state === 'partial-cache';
  if (list_state === 'empty') return <EmptyBook locale={locale} drafts={drafts} save_attempt={save_attempt} onOpenSettings={onOpenSettings} onStartRecord={onStartRecord} onResumeDraft={onResumeDraft} onRetry={onRetry} refreshing={refreshing} />;

  const content = list_state === 'filter-empty' ? <View style={styles.emptyState}><Text style={styles.emptyStateTitle}>{copy.noResults}</Text><Text style={styles.bodyMuted}>{copy.noResultsBody}</Text><Button label={copy.filter} onPress={onOpenFilter} tone="secondary" /></View>
    : list_state === 'error' ? <View style={styles.emptyState}><Notice message={copy.listError} tone="error" /><Button label={copy.retry} onPress={onRetry} tone="secondary" /></View>
    : list_state === 'loading' ? <Notice message={locale === 'ko' ? '기록을 불러오는 중이에요.' : 'Loading records.'} tone="info" busy />
    : <><View style={[styles.grid, columns === 1 && styles.singleColumn]}>{records.map((record) => {
      const date = displayDate(record.fields.diary_date) || '—';
      const title = recordTitle(record, locale);
      return <RecordCard key={record.id} width={cardWidth} date={date} title={title} source={sourceFor(record.stamp.local_uri, designStamp, record.stamp.image_headers)} onPress={() => onOpenRecord(record.id)} onToggleFavorite={() => onToggleFavorite(record.id)} isFavorite={record.fields.is_favorite} favoriteLabel={record.fields.is_favorite ? copy.favoriteOn : copy.favorite} accessibilityLabel={`${copy.record}, ${date}, ${title}`} />;
    })}</View>{list_state === 'partial-cache' ? <Text style={styles.caption}>{copy.partial}</Text> : null}{has_more ? <Button label={copy.more} onPress={onLoadMore} tone="secondary" disabled={refreshing} /> : null}</>;

  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <View style={styles.flex}>
      <ScrollView refreshControl={<RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRetry} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandHeader}><Text accessibilityRole="header" style={styles.brand}>{copy.brand}</Text><IconButton label={copy.settings} onPress={onOpenSettings}><AppIcon name="settings" size={20} color={theme.colors.ink} /></IconButton></View>
        <View style={styles.intro}><SemanticText accessibilityRole="header" style={styles.heading}>{copy.bookHeading}</SemanticText><SemanticText style={styles.bodyMuted}>{copy.bookLead}</SemanticText></View>
        <View style={styles.filters}><FilterChip label={copy.all} selected={!isActive} onPress={onOpenFilter} /><FilterChip label={copy.date} selected={Boolean(filter.start_date || filter.end_date)} onPress={onOpenFilter} /><FilterChip label={copy.filter} selected={isActive} onPress={onOpenFilter} /></View>
        {showRecordCount ? <Text style={styles.month}>{recordCountLabel(records.length, locale)}</Text> : null}
        {content}
        <SaveAttemptNotice locale={locale} attempt={save_attempt} />
      </ScrollView>
      <View style={styles.footer}><Button label={copy.importPhoto} onPress={onStartRecord} />{draft ? <Button label={copy.resume(1)} onPress={() => onResumeDraft(draft.draft_id)} tone="subtle" /> : null}<Text style={styles.caption}>{copy.privateBook}</Text></View>
      {filterSheet ? <FilterSheet locale={locale} sheet={filterSheet} records={records} onChangeSheet={onChangeSheet} onApply={onApplySheet} onCancel={onCancelSheet} onClose={onRequestCloseSheet} /> : null}
    </View>
  </SafeAreaView>;
}

export function updateFilter(sheet: Extract<SheetState, { kind: 'filter' }>, change: SheetChange) { return change.kind === 'filter' ? { ...sheet.working, ...change.working } : sheet.working; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 16 }, emptyContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }, brandHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: theme.colors.ink, fontFamily: theme.typography.displayFamily, fontSize: 20, lineHeight: 30 }, intro: { gap: 8 }, heading: { color: theme.colors.ink, fontSize: 28, lineHeight: 38, fontWeight: '600' }, emptyHeading: { color: theme.colors.ink, fontSize: 28, lineHeight: 38, fontWeight: '600' }, emptyBody: { color: theme.colors.inkSecondary, fontSize: 16, lineHeight: 24 }, bodyMuted: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 }, filters: { flexDirection: 'row', gap: 8 }, month: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, singleColumn: { flexDirection: 'column' }, emptyState: { gap: 16, paddingVertical: 32 }, emptyStateTitle: { color: theme.colors.ink, fontSize: 24, lineHeight: 32, fontWeight: '600' }, footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 8 }, emptyExample: { backgroundColor: theme.colors.bgSurface, borderRadius: theme.radii.card, paddingHorizontal: 28, paddingVertical: 24, gap: 12, ...theme.shadows.low }, emptyImage: { height: 176, minHeight: 0, borderWidth: 0, backgroundColor: 'transparent' }, emptyCaption: { color: theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' }, caption: { color: theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
});
