import React from 'react';
import { ImageSourcePropType, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, Notice, StampImage } from '../primitives';
import { FilterChip } from '../components/FilterChip';
import { RecordCard } from '../components/RecordCard';
import { AppIcon } from '../components/AppIcon';
import { FilterSheet } from '../sheets/FilterSheet';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { BookFilter, BookScreenProps, DemoRecord, DisplayLocale, SheetChange, SheetState } from '../contract';

const designStamp = require('../../../design/images/generated-1788887279815.png') as ImageSourcePropType;

function sourceFor(uri: string, fallback: ImageSourcePropType): ImageSourcePropType {
  return uri && !uri.startsWith('demo-') && uri !== 'demo' ? { uri } : fallback;
}

function formatDate(value: string) { return value ? value.replaceAll('-', '. ') : '—'; }

function recordTitle(record: DemoRecord, locale: DisplayLocale) {
  return record.fields.user_note || record.fields.place_name || (locale === 'ko' ? '기록' : 'Record');
}

function EmptyBook({ locale, drafts, onOpenSettings, onStartRecord, onResumeDraft }: Pick<BookScreenProps, 'locale' | 'drafts' | 'onOpenSettings' | 'onStartRecord' | 'onResumeDraft'>) {
  const copy = getBasicCopy(locale);
  const draft = drafts.find((item) => item.kind === 'new');
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <ScrollView contentContainerStyle={styles.emptyContent} showsVerticalScrollIndicator={false}>
      <View style={styles.brandHeader}><Text accessibilityRole="header" style={styles.brand}>{copy.brand}</Text><IconButton label={copy.settings} onPress={onOpenSettings}><AppIcon name="settings" size={20} color={theme.colors.ink} /></IconButton></View>
      <View style={styles.emptyExample}><StampImage source={designStamp} accessibilityLabel={copy.designExample} style={styles.emptyImage} /><Text style={styles.emptyCaption}>{copy.designExample}</Text></View>
      <Text style={styles.emptyHeading}>{copy.emptyTitle}</Text>
      <Text style={styles.emptyBody}>{copy.emptyBody}</Text>
      <Button label={copy.importPhoto} onPress={onStartRecord} />
      {draft ? <Button label={copy.resume(1)} onPress={() => onResumeDraft(draft.draft_id)} tone="subtle" /> : null}
      <Text style={styles.caption}>{copy.emptyHint}</Text>
    </ScrollView>
  </SafeAreaView>;
}

function activeFilter(filter: BookFilter) { return Boolean(filter.start_date || filter.end_date || filter.semantic_tag || filter.favorite_only); }

export function BookScreen({ locale, session: _session, images, records, drafts, filter, list_state, model_status: _modelStatus, save_attempt, sheet, has_more, onOpenSettings, onStartRecord, onResumeDraft, onOpenRecord, onToggleFavorite, onOpenFilter, onChangeSheet, onApplySheet, onCancelSheet, onRequestCloseSheet, onLoadMore, onRetry }: BookScreenProps) {
  const copy = getBasicCopy(locale);
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale >= 1.5 || width < 360 ? 1 : width >= 760 ? Math.min(4, Math.max(3, Math.floor((width - 28) / 240))) : 2;
  const cardWidth = (width - 40 - 12 * (columns - 1)) / columns;
  const filterSheet = sheet?.kind === 'filter' ? sheet : null;
  const isActive = activeFilter(filter);
  const draft = drafts.find((item) => item.kind === 'new');
  if (list_state === 'empty') return <EmptyBook locale={locale} drafts={drafts} onOpenSettings={onOpenSettings} onStartRecord={onStartRecord} onResumeDraft={onResumeDraft} />;

  const content = list_state === 'filter-empty' ? <View style={styles.emptyState}><Text style={styles.emptyStateTitle}>{copy.noResults}</Text><Text style={styles.bodyMuted}>{copy.noResultsBody}</Text><Button label={copy.filter} onPress={onOpenFilter} tone="secondary" /></View>
    : list_state === 'error' ? <View style={styles.emptyState}><Notice message={copy.listError} tone="error" /><Button label={copy.retry} onPress={onRetry} tone="secondary" /></View>
    : <><View style={[styles.grid, columns === 1 && styles.singleColumn]}>{records.map((record) => <RecordCard key={record.id} width={cardWidth} date={formatDate(record.fields.diary_date)} title={recordTitle(record, locale)} source={sourceFor(record.stamp.local_uri, designStamp)} onPress={() => onOpenRecord(record.id)} onToggleFavorite={() => onToggleFavorite(record.id)} isFavorite={record.fields.is_favorite} favoriteLabel={record.fields.is_favorite ? copy.favoriteOn : copy.favorite} accessibilityLabel={`${copy.record}, ${record.fields.diary_date}`} />)}</View>{list_state === 'partial-cache' ? <Text style={styles.caption}>{copy.partial}</Text> : null}{has_more ? <Button label={copy.more} onPress={onLoadMore} tone="secondary" /> : null}</>;

  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandHeader}><Text accessibilityRole="header" style={styles.brand}>{copy.brand}</Text><IconButton label={copy.settings} onPress={onOpenSettings}><AppIcon name="settings" size={20} color={theme.colors.ink} /></IconButton></View>
        <View style={styles.intro}><Text style={styles.heading}>{copy.bookHeading}</Text><Text style={styles.bodyMuted}>{copy.bookLead}</Text></View>
        <View style={styles.filters}><FilterChip label={copy.all} selected={!isActive} onPress={onOpenFilter} /><FilterChip label={copy.date} selected={Boolean(filter.start_date || filter.end_date)} onPress={onOpenFilter} /><FilterChip label={copy.filter} selected={isActive} onPress={onOpenFilter} /></View>
        <Text style={styles.month}>{copy.month(records.length)}</Text>
        {content}
        {save_attempt?.state === 'pending' || save_attempt?.state === 'uncertain' ? <Text style={styles.caption}>{locale === 'ko' ? '저장 결과 확인 중' : 'Checking the save result'}</Text> : null}
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
