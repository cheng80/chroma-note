import { SemanticText } from '../components/SemanticText';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Notice, Sheet } from '../primitives';
import { CheckRow } from '../components/CheckRow';
import { FilterChip } from '../components/FilterChip';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { BookFilter, DemoRecord, DisplayLocale, SheetChange } from '../contract';
import { DateField } from './DateField';

export function FilterSheet({ locale, sheet, records, onChangeSheet, onApply, onCancel, onClose, restoreFocusRef }: { locale: DisplayLocale; sheet: Extract<NonNullable<import('../contract').SheetState>, { kind: 'filter' }>; records: DemoRecord[]; onChangeSheet: (change: SheetChange) => void; onApply: () => void; onCancel: () => void; onClose: () => void; restoreFocusRef?: React.RefObject<unknown | null> }) {
  const copy = getBasicCopy(locale);
  const tags = Array.from(new Set(records.flatMap((record) => [...record.fields.semantic_tags, ...record.fields.mood_tags])));
  const [expandedDate, setExpandedDate] = useState<'start' | 'end' | null>(null);
  const update = (working: BookFilter) => onChangeSheet({ kind: 'filter', working });
  const isAll = !sheet.working.start_date && !sheet.working.end_date && !sheet.working.semantic_tag && !sheet.working.favorite_only;
  return <Sheet title={copy.filter} closeLabel={copy.close} restoreFocusRef={restoreFocusRef} onRequestClose={onClose} footer={<><Button label={copy.apply} onPress={onApply} /><Button label={copy.cancel} onPress={onCancel} tone="secondary" /></>}>
    <DateField label={copy.startDate} locale={locale} value={sheet.working.start_date} onChange={(start_date) => update({ ...sheet.working, start_date })} onClear={() => update({ ...sheet.working, start_date: null })} expanded={expandedDate === 'start'} onExpandedChange={(expanded) => setExpandedDate(expanded ? 'start' : null)} />
    <DateField label={copy.endDate} locale={locale} value={sheet.working.end_date} onChange={(end_date) => update({ ...sheet.working, end_date })} onClear={() => update({ ...sheet.working, end_date: null })} expanded={expandedDate === 'end'} onExpandedChange={(expanded) => setExpandedDate(expanded ? 'end' : null)} />
    <SemanticText style={styles.label}>{copy.tag}</SemanticText>
    <View style={styles.chips}><FilterChip label={copy.clear} selected={isAll} onPress={() => update({ start_date: null, end_date: null, semantic_tag: null, favorite_only: false })} />{tags.map((tag) => <FilterChip key={tag} label={tag} selected={sheet.working.semantic_tag === tag} onPress={() => update({ ...sheet.working, semantic_tag: sheet.working.semantic_tag === tag ? null : tag })} />)}</View>
    <CheckRow label={copy.favoriteOnly} checked={sheet.working.favorite_only} onChange={(favorite_only) => update({ ...sheet.working, favorite_only })} />
    {sheet.error ? <Notice message={copy.filterInvalid} tone="error" /> : null}
  </Sheet>;
}

const styles = StyleSheet.create({ label: { color: theme.colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
