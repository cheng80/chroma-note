import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR_PRESETS, COLOR_SEARCH_RANGES, createColorSearch, type ColorSearch } from '../../domain/color-search';
import { SemanticText } from './SemanticText';
import { FilterChip } from './FilterChip';
import { ColorChip } from './ColorChip';
import { ColorPalettePicker } from './ColorPalettePicker';
import { theme } from '../theme';
import type { DisplayLocale } from '../contract';

export function ColorSearchPicker({ locale, selected, onChange }: { locale: DisplayLocale; selected?: ColorSearch | null; onChange: (value: ColorSearch | null) => void }) {
  const [mode, setMode] = useState<'presets' | 'palette'>(() => selected && !COLOR_PRESETS.some(p => p.hex === selected.hex) ? 'palette' : 'presets');
  const choose = (hex: string) => onChange({ ...(selected ?? createColorSearch(hex)), hex });
  return <View style={styles.section}>
    <View style={styles.row}><FilterChip label={locale === 'ko' ? '기본색' : 'Basic colors'} selected={mode === 'presets'} onPress={() => setMode('presets')} /><FilterChip label={locale === 'ko' ? '팔레트' : 'Palette'} selected={mode === 'palette'} onPress={() => setMode('palette')} /></View>
    {mode === 'presets' ? <View style={styles.grid}>{COLOR_PRESETS.map(preset => <View key={preset.id} style={styles.cell}><ColorChip hex={preset.hex} label={preset.label[locale]} selected={selected?.hex === preset.hex} onPress={() => selected?.hex === preset.hex ? onChange(null) : choose(preset.hex)} /></View>)}</View> : <ColorPalettePicker hex={selected?.hex ?? '#5D9665'} locale={locale} onSelect={choose} />}
    {selected ? <>
      <View style={styles.selection}><View style={[styles.swatch, { backgroundColor: selected.hex }]} /><SemanticText style={styles.label}>{locale === 'ko' ? '이 색과 비슷한 색 찾기' : 'Find colors like this'}</SemanticText><FilterChip label={locale === 'ko' ? '해제' : 'Clear'} selected={false} onPress={() => onChange(null)} /></View>
      <SemanticText style={styles.label}>{locale === 'ko' ? '유사 범위' : 'Color range'}</SemanticText>
      <View style={styles.row}>{COLOR_SEARCH_RANGES.map(range => <FilterChip key={range.id} label={range.label[locale]} selected={selected.range === range.id} onPress={() => onChange({ ...selected, range: range.id })} />)}</View>
      <SemanticText style={styles.label}>{locale === 'ko' ? '사진 속 비중' : 'Share of the photo'}</SemanticText>
      <View style={styles.row}>{([0.05, 0.1, 0.25] as const).map(minWeight => <FilterChip key={minWeight} label={locale === 'ko' ? `${minWeight * 100}% 이상` : `${minWeight * 100}% or more`} selected={selected.minWeight === minWeight} onPress={() => onChange({ ...selected, minWeight })} />)}</View>
      <SemanticText style={styles.hint}>{locale === 'ko' ? '비슷한 대표색의 비중을 합쳐요. 저장된 대표색을 바탕으로 한 추정값이에요.' : 'Similar palette colors are added together. Their share is an estimate from the saved palette.'}</SemanticText>
    </> : <SemanticText style={styles.hint}>{locale === 'ko' ? '기본색이나 팔레트에서 고른 색과 비슷한 색을 찾아요.' : 'Find colors similar to a basic color or a shade from the palette.'}</SemanticText>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, cell: { flexBasis: '30%', minWidth: 96, flexGrow: 1 },
  selection: { flexDirection: 'row', alignItems: 'center', gap: 8 }, swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderControl },
  label: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: theme.colors.ink, flexShrink: 1 }, hint: { fontSize: 14, lineHeight: 21, color: theme.colors.inkSecondary },
});
