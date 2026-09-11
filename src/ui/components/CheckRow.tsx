import React from 'react';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { useEntranceProgress, usePressScale } from './motion';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const { animatedStyle, setPressed } = usePressScale();
  const { progress } = useEntranceProgress(checked, theme.motion.noticeDuration);
  const checkStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: progress.value }] }));
  return <AnimatedPressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={() => onChange(!checked)} style={[styles.row, animatedStyle]}><View style={[styles.box, checked && styles.checked]}><Reanimated.View style={checkStyle}><AppIcon name="check" size={16} color={theme.colors.inverse} /></Reanimated.View></View><Text style={styles.label}>{label}</Text></AnimatedPressable>;
}

const styles = StyleSheet.create({ row: { minHeight: theme.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }, box: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: theme.colors.accent }, label: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 } });
