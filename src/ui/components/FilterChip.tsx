import React, { forwardRef, useEffect, useState } from 'react';
import Reanimated from 'react-native-reanimated';
import { Animated, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import { AppIcon } from './AppIcon';
import { usePressScale } from './motion';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export const FilterChip = forwardRef<React.ElementRef<typeof Pressable>, { label: string; selected: boolean; onPress: () => void }>(function FilterChip({ label, selected, onPress }, ref) {
  const [progress] = useState(() => new Animated.Value(selected ? 1 : 0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const { animatedStyle, setPressed } = usePressScale();
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => subscription.remove(); }, []);
  useEffect(() => { Animated.timing(progress, { toValue: selected ? 1 : 0, duration: reduceMotion ? 0 : 140, useNativeDriver: true }).start(); }, [progress, reduceMotion, selected]);
  return <AnimatedPressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onPress} style={[styles.chip, selected && styles.selected, animatedStyle]}>{selected ? <Animated.View style={[styles.check, { opacity: progress }]}><AppIcon name="check" size={16} color={theme.colors.accent} /></Animated.View> : null}<SemanticText style={[styles.label, selected && styles.selectedLabel]}>{label}</SemanticText></AnimatedPressable>;
});

const styles = StyleSheet.create({
  chip: { minHeight: theme.touchTarget, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radii.round, borderWidth: 1, borderColor: theme.colors.borderControl, backgroundColor: theme.colors.bgSurface, flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', justifyContent: 'center' },
  check: { width: 16, height: 16 },
  selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSubtle },
  label: { flexShrink: 1, color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, selectedLabel: { color: theme.colors.accent, fontWeight: '700' },
});
