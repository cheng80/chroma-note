import React, { forwardRef } from 'react';
import Reanimated from 'react-native-reanimated';
import { Pressable, StyleSheet } from 'react-native';
import { AppIcon } from './AppIcon';
import { usePressScale, useSelectionProgress } from './motion';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export const FilterChip = forwardRef<React.ElementRef<typeof Pressable>, { label: string; selected: boolean; onPress: () => void }>(function FilterChip({ label, selected, onPress }, ref) {
  const { animatedStyle, setPressed } = usePressScale();
  const checkStyle = useSelectionProgress(selected);
  return <AnimatedPressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onPress} style={[styles.chip, selected && styles.selected, animatedStyle]}>{selected ? <Reanimated.View style={[styles.check, checkStyle]}><AppIcon name="check" size={16} color={theme.colors.accent} /></Reanimated.View> : null}<SemanticText style={[styles.label, selected && styles.selectedLabel]}>{label}</SemanticText></AnimatedPressable>;
});

const styles = StyleSheet.create({
  chip: { minHeight: theme.touchTarget, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radii.round, borderWidth: 1, borderColor: theme.colors.borderControl, backgroundColor: theme.colors.bgSurface, flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', justifyContent: 'center' },
  check: { width: 16, height: 16 },
  selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSubtle },
  label: { flexShrink: 1, color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, selectedLabel: { color: theme.colors.accent, fontWeight: '700' },
});
