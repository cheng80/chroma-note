import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
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

export function usePressScale() {
  const reduceMotion = useLiveReduceMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const setPressed = (pressed: boolean) => {
    // Reanimated shared values are intentionally mutable outside React render.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(reduceMotion ? 1 : pressed ? theme.motion.pressScale : 1, {
      duration: theme.motion.pressDuration,
      dampingRatio: 1,
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
