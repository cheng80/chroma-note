import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { AppIcon } from './AppIcon';
import { SemanticText } from './SemanticText';
import { usePressScale } from './motion';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export function ColorChip({ hex, label, selected = false, onPress, hint }: { hex: string; label: string; selected?: boolean; onPress: () => void; hint?: string }) {
  const { animatedStyle, setPressed } = usePressScale();
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ selected }} onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={[styles.chip, selected && styles.selected, animatedStyle]}>
    <View style={[styles.swatch, { backgroundColor: hex }]} />
    <SemanticText style={[styles.label, selected && styles.selectedLabel]}>{label}</SemanticText>
    {selected ? <AppIcon name="check" size={16} color={theme.colors.accent} /> : null}
  </AnimatedPressable>;
}

const styles = StyleSheet.create({
  chip: { minHeight: theme.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderRadius: theme.radii.round, borderWidth: 1, borderColor: theme.colors.borderControl, backgroundColor: theme.colors.bgSurface },
  selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSubtle },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.borderControl },
  label: { color: theme.colors.ink, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  selectedLabel: { color: theme.colors.accent, fontWeight: '700' },
});
