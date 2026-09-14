import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SemanticText } from './SemanticText';
import { ColorChip } from './ColorChip';
import { palettePercentages } from './palette-weights';
import { theme } from '../theme';
import type { ColorTag, DisplayLocale } from '../contract';

export function RecordColors({ tags, locale, onSelect }: { tags: ColorTag[]; locale: DisplayLocale; onSelect: (hex: string) => void }) {
  if (!tags.length) return null;
  const percentages = palettePercentages(tags.map(tag => tag.weight));
  return <View style={styles.section}>
    <SemanticText style={styles.title}>{locale === 'ko' ? '사진에서 찾은 색' : 'Colors in this photo'}</SemanticText>
    <SemanticText style={styles.hint}>{locale === 'ko' ? '색을 누르면 비슷한 색이 담긴 기록을 모아 볼 수 있어요.' : 'Tap a color to explore records with similar colors.'}</SemanticText>
    <View style={styles.colors}>{tags.map((tag, index) => {
      return <ColorChip key={`${tag.hex}-${index}`} hex={tag.hex} label={`${percentages[index]}%`} hint={locale === 'ko' ? '비슷한 색이 담긴 기록 모아보기' : 'Explore records with similar colors'} onPress={() => onSelect(tag.hex)} />;
    })}</View>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 12 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: theme.colors.ink },
  hint: { fontSize: 14, lineHeight: 21, color: theme.colors.inkSecondary },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
