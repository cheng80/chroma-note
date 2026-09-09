import React, { useEffect, useState } from 'react';
import Reanimated from 'react-native-reanimated';
import { Animated, Pressable, StyleSheet, Text, AccessibilityInfo } from 'react-native';
import { AppIcon } from './AppIcon';
import { usePressScale } from './motion';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const [progress] = useState(() => new Animated.Value(selected ? 1 : 0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const { animatedStyle, setPressed } = usePressScale();
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => subscription.remove(); }, []);
  useEffect(() => { Animated.timing(progress, { toValue: selected ? 1 : 0, duration: reduceMotion ? 0 : 140, useNativeDriver: true }).start(); }, [progress, reduceMotion, selected]);
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onPress} style={[styles.chip, selected && styles.selected, animatedStyle]}>{selected ? <Animated.View style={[styles.check, { opacity: progress }]}><AppIcon name="check" size={16} color={theme.colors.accent} /></Animated.View> : null}<Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text></AnimatedPressable>;
}

const styles = StyleSheet.create({
  chip: { minHeight: theme.touchTarget, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radii.round, borderWidth: 1, borderColor: theme.colors.borderControl, backgroundColor: theme.colors.bgSurface, flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', justifyContent: 'center' },
  check: { width: 16, height: 16 },
  selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSubtle },
  label: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, selectedLabel: { color: theme.colors.accent, fontWeight: '700' },
});
