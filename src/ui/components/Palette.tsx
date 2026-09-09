import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ColorTag } from '../contract';
import { theme } from '../theme';

export function Palette({ tags }: { tags: ColorTag[] }) {
  return (
    <View accessibilityRole="summary" style={styles.palette}>
      {tags.map((tag, index) => (
        <View key={`${tag.hex}-${index}`} accessible accessibilityLabel={`${tag.hex}, ${Math.round(tag.weight * 100)}%`} style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: tag.hex }]} />
          <Text style={styles.weight}>{Math.round(tag.weight * 100)}%</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  palette: { flexDirection: 'row', gap: theme.spacing.sm },
  item: { flex: 1, minWidth: 36, gap: theme.spacing.xs },
  swatch: { height: 12, borderRadius: 2, borderWidth: 1, borderColor: theme.colors.borderControl },
  weight: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
});
