import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice, Sheet } from '../primitives';
import { CheckRow } from '../components/CheckRow';
import { FilterChip } from '../components/FilterChip';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { BookFilter, DemoRecord, DisplayLocale, SheetChange } from '../contract';

export function FilterSheet({ locale, sheet, records, onChangeSheet, onApply, onCancel, onClose }: { locale: DisplayLocale; sheet: Extract<NonNullable<import('../contract').SheetState>, { kind: 'filter' }>; records: DemoRecord[]; onChangeSheet: (change: SheetChange) => void; onApply: () => void; onCancel: () => void; onClose: () => void }) {
  const copy = getBasicCopy(locale);
  const tags = Array.from(new Set(records.flatMap((record) => [...record.fields.semantic_tags, ...record.fields.mood_tags])));
  const update = (working: BookFilter) => onChangeSheet({ kind: 'filter', working });
  const isAll = !sheet.working.start_date && !sheet.working.end_date && !sheet.working.semantic_tag && !sheet.working.favorite_only;
  return <Sheet title={copy.filter} onRequestClose={onClose} footer={<><Button label={copy.apply} onPress={onApply} /><Button label={copy.cancel} onPress={onCancel} tone="secondary" /></>}>
    <Field label={copy.startDate} value={sheet.working.start_date ?? ''} onChangeText={(value) => update({ ...sheet.working, start_date: value || null })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
    <Field label={copy.endDate} value={sheet.working.end_date ?? ''} onChangeText={(value) => update({ ...sheet.working, end_date: value || null })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
    <Text style={styles.label}>{copy.tag}</Text>
    <View style={styles.chips}><FilterChip label={copy.clear} selected={isAll} onPress={() => update({ start_date: null, end_date: null, semantic_tag: null, favorite_only: false })} />{tags.map((tag) => <FilterChip key={tag} label={tag} selected={sheet.working.semantic_tag === tag} onPress={() => update({ ...sheet.working, semantic_tag: sheet.working.semantic_tag === tag ? null : tag })} />)}</View>
    <CheckRow label={copy.favoriteOnly} checked={sheet.working.favorite_only} onChange={(favorite_only) => update({ ...sheet.working, favorite_only })} />
    {sheet.error ? <Notice message={copy.filterInvalid} tone="error" /> : null}
  </Sheet>;
}

const styles = StyleSheet.create({ label: { color: theme.colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
