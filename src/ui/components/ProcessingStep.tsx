import React, { useEffect, useRef } from 'react';
import Reanimated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppState, StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from './AppIcon';
import { useEntranceProgress } from './motion';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';

export type ProcessingStepStatus = 'done' | 'active' | 'waiting' | 'error';

export function ProcessingStep({ label, status, statusLabel }: { label: string; status: ProcessingStepStatus; statusLabel: string }) {
  const icon: AppIconName = status === 'done' ? 'circle-check' : status === 'active' ? 'refresh-cw' : status === 'error' ? 'circle-alert' : 'circle-check';
  const color = status === 'done' ? theme.colors.success : status === 'active' ? theme.colors.accent : status === 'error' ? theme.colors.danger : theme.colors.inkDisabled;
  const { progress, reduceMotion } = useEntranceProgress(true, theme.motion.enterDuration, `${status}:${label}`);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const previousStatus = useRef(status);

  useEffect(() => {
    const update = (appState: string) => {
      cancelAnimation(rotation);
      rotation.value = 0;
      if (status === 'active' && !reduceMotion && appState === 'active') {
        rotation.value = withRepeat(
          withTiming(1, {
            duration: theme.motion.loadingDuration,
            easing: Easing.linear,
            reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
          }),
          -1,
          false,
          undefined,
          reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
        );
      }
    };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => {
      subscription.remove();
      cancelAnimation(rotation);
    };
  }, [reduceMotion, rotation, status]);

  useEffect(() => {
    cancelAnimation(scale);
    const completed = previousStatus.current !== 'done' && status === 'done';
    previousStatus.current = status;
    scale.value = completed && !reduceMotion ? 0.7 : 1;
    if (completed && !reduceMotion) {
      scale.value = withSpring(1, { stiffness: 320, damping: 16, reduceMotion: ReduceMotion.Never });
    }
    return () => cancelAnimation(scale);
  }, [reduceMotion, scale, status]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : interpolate(progress.value, [0, 1], [4, 0]) }],
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value * 360}deg` },
      { scale: reduceMotion ? 1 : scale.value * (1 + 0.12 * Math.sin(rotation.value * Math.PI)) },
    ],
  }));

  return (
    <Reanimated.View accessible accessibilityRole="text" accessibilityLabel={`${label}, ${statusLabel}`} accessibilityLiveRegion={status === 'error' ? 'assertive' : status === 'active' ? 'polite' : 'none'} style={[styles.root, animatedStyle]}>
      <View style={styles.indicator}><Reanimated.View style={indicatorStyle}><AppIcon name={icon} size={18} color={color} /></Reanimated.View></View>
      <SemanticText style={styles.label}>{label}</SemanticText>
      <SemanticText style={[styles.status, status === 'active' && styles.activeText, status === 'done' && styles.doneText, status === 'error' && styles.errorText]}>{statusLabel}</SemanticText>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  indicator: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  status: { flexShrink: 1, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  activeText: { color: theme.colors.accent },
  doneText: { color: theme.colors.success },
  errorText: { color: theme.colors.danger },
});
