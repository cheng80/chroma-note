import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

export function useLiveReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    let receivedRuntimeEvent = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      receivedRuntimeEvent = true;
      if (mounted) setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !receivedRuntimeEvent) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

export function usePressScale(disabled = false) {
  const reduceMotion = useLiveReduceMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: disabled || reduceMotion ? 1 : scale.value }] }));

  useEffect(() => {
    if (disabled || reduceMotion) scale.set(1);
  }, [disabled, reduceMotion, scale]);

  const setPressed = (pressed: boolean) => {
    // Reanimated shared values are intentionally mutable outside React render.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(disabled || reduceMotion ? 1 : pressed ? theme.motion.pressScale : 1, {
      duration: pressed ? theme.motion.pressDuration : theme.motion.releaseDuration,
      dampingRatio: pressed ? 1 : 0.55,
      reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
    });
  };

  return { animatedStyle, setPressed };
}

export function useEntranceProgress(visible: boolean, duration: number = theme.motion.enterDuration, restartKey?: unknown) {
  const reduceMotion = useLiveReduceMotion();
  const progress = useSharedValue(visible && reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? 0 : duration,
      easing: Easing.out(Easing.cubic),
      reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
    });
  }, [duration, progress, reduceMotion, restartKey, visible]);

  return { progress, reduceMotion };
}

/** Only the icon bounces; the label and its semantic layout remain mounted. */
export function useSelectionProgress(selected: boolean) {
  const reduceMotion = useLiveReduceMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(selected ? 1 : 0, {
      duration: theme.motion.releaseDuration,
      dampingRatio: 0.5,
      reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
    });
  }, [progress, reduceMotion, selected]);
  return useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, progress.value)),
    transform: [{ scale: Math.max(0, progress.value) }],
  }));
}

/** Color feedback never moves the input, caret, or text while typing. */
export function useFieldFeedback(focused: boolean, error?: string) {
  const reduceMotion = useLiveReduceMotion();
  const focus = useSharedValue(0);
  const errorPulse = useSharedValue(0);
  const previousError = useRef<string | undefined>(undefined);
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, {
      duration: theme.motion.enterDuration,
      reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
    });
  }, [focus, focused, reduceMotion]);
  useEffect(() => {
    const newError = Boolean(error) && error !== previousError.current;
    previousError.current = error;
    if (!newError && !reduceMotion && error) return;
    errorPulse.value = newError && !reduceMotion ? 1 : 0;
    errorPulse.value = withTiming(0, {
      duration: theme.motion.errorDuration,
      reduceMotion: reduceMotion ? ReduceMotion.Always : ReduceMotion.Never,
    });
  }, [error, errorPulse, reduceMotion]);
  return useAnimatedStyle(() => ({
    borderColor: error ? theme.colors.danger : interpolateColor(focus.value, [0, 1], [theme.colors.borderControl, theme.colors.borderFocus]),
    backgroundColor: interpolateColor(errorPulse.value, [0, 1], [
      interpolateColor(focus.value, [0, 1], [theme.colors.bgSurface, theme.colors.accentSubtle]),
      theme.colors.dangerSubtle,
    ]),
  }));
}
