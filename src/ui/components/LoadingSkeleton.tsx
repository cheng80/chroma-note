import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useLiveReduceMotion } from './motion';
import { theme } from '../theme';

/** A real pending state owns this overlay; it never estimates progress. */
export function LoadingSkeleton({ style, overlay = false }: { style?: StyleProp<ViewStyle>; overlay?: boolean }) {
  const reduceMotion = useLiveReduceMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const width = useSharedValue(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    cancelAnimation(sweep);
    sweep.value = 0;
    if (!reduceMotion && foreground) {
      sweep.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, false, undefined, ReduceMotion.Never);
    }
    return () => cancelAnimation(sweep);
  }, [foreground, reduceMotion, sweep]);
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || !foreground ? 0 : 1,
    transform: [{ translateX: -160 + (width.value + 320) * sweep.value }],
  }));
  return <View testID="loading-skeleton" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.root, overlay && styles.overlay, style]}
    onLayout={event => { width.value = event.nativeEvent.layout.width; }}>
    <Animated.View style={[styles.sweep, shimmerStyle]}>
      <Svg width="100%" height="100%"><Defs><LinearGradient id="skeletonLight" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={theme.colors.bgSurface} stopOpacity="0" /><Stop offset="0.5" stopColor={theme.colors.bgSurface} stopOpacity="0.9" /><Stop offset="1" stopColor={theme.colors.bgSurface} stopOpacity="0" /></LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#skeletonLight)" /></Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#D7DED966' },
  overlay: { backgroundColor: 'transparent' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 160 },
});
