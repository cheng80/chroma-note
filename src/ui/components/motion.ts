import { useEffect } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

export function usePressScale() {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const setPressed = (pressed: boolean) => {
    // Reanimated shared values are intentionally mutable outside React render.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(reduceMotion ? 1 : pressed ? theme.motion.pressScale : 1, {
      duration: theme.motion.pressDuration,
      dampingRatio: 1,
      reduceMotion: ReduceMotion.System,
    });
  };

  return { animatedStyle, setPressed };
}

export function useEntranceProgress(visible: boolean, duration: number = theme.motion.enterDuration, restartKey?: unknown) {
  const reduceMotion = useReducedMotion();
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
      reduceMotion: ReduceMotion.System,
    });
  }, [duration, progress, reduceMotion, restartKey, visible]);

  return { progress, reduceMotion };
}
