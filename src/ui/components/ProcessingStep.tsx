import React, { useEffect } from 'react';
import Reanimated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from './AppIcon';
import { useEntranceProgress } from './motion';
import { theme } from '../theme';

export type ProcessingStepStatus = 'done' | 'active' | 'waiting' | 'error';

export function ProcessingStep({ label, status, statusLabel }: { label: string; status: ProcessingStepStatus; statusLabel: string }) {
  const icon: AppIconName = status === 'done' ? 'circle-check' : status === 'active' ? 'refresh-cw' : status === 'error' ? 'circle-alert' : 'circle-check';
  const color = status === 'done' ? theme.colors.success : status === 'active' ? theme.colors.accent : status === 'error' ? theme.colors.danger : theme.colors.inkDisabled;
  const { progress, reduceMotion } = useEntranceProgress(true, theme.motion.enterDuration, status);
  const rotation = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = 0;
    if (status === 'active' && !reduceMotion) {
      rotation.value = withRepeat(withTiming(1, {
        duration: theme.motion.loadingDuration,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }), -1, false);
    }
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation, status]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : interpolate(progress.value, [0, 1], [4, 0]) }],
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  return (
    <Reanimated.View accessible accessibilityRole="text" accessibilityLabel={`${label}, ${statusLabel}`} accessibilityLiveRegion={status === 'error' ? 'assertive' : status === 'active' ? 'polite' : 'none'} style={[styles.root, animatedStyle]}>
      <View style={styles.indicator}><Reanimated.View style={indicatorStyle}><AppIcon name={icon} size={18} color={color} /></Reanimated.View></View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.status, status === 'active' && styles.activeText, status === 'error' && styles.errorText]}>{statusLabel}</Text>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  indicator: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  status: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  activeText: { color: theme.colors.accent },
  errorText: { color: theme.colors.danger },
});
