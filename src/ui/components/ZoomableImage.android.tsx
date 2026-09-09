import React, { useRef, useState } from 'react';
import { Scan, ZoomIn, ZoomOut } from 'lucide-react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  ImageSourcePropType,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { DisplayLocale } from '../contract';
import { theme } from '../theme';
import { IconButton } from './IconButton';
import { StampImage } from './StampImage';
import { clamp, clampOffset, contentCoordinateAtFocal, offsetForFocal } from './zoomMath';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

type ZoomableImageProps = {
  locale: DisplayLocale;
  source: ImageSourcePropType;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export function ZoomableImage({ locale, source, accessibilityLabel, style }: ZoomableImageProps) {
  const scale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const gestureStartScale = useSharedValue(MIN_SCALE);
  const focalContentX = useSharedValue(0);
  const focalContentY = useSharedValue(0);
  const currentTransform = useRef({ scale: MIN_SCALE, x: 0, y: 0 });
  const [requestedScale, setRequestedScale] = useState(MIN_SCALE);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const labels = locale === 'ko'
    ? { zoomIn: '확대', zoomOut: '축소', reset: '원래 크기' }
    : { zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Actual size' };

  const rememberTransform = (nextScale: number, x: number, y: number) => {
    currentTransform.current = { scale: nextScale, x, y };
    setRequestedScale(nextScale);
  };
  const applyTransform = (nextScale: number, x: number, y: number) => {
    scale.value = nextScale;
    translateX.value = x;
    translateY.value = y;
    rememberTransform(nextScale, x, y);
  };
  const applyScale = (value: number) => {
    const current = currentTransform.current;
    const nextScale = clamp(value, MIN_SCALE, MAX_SCALE);
    const ratio = nextScale / current.scale;
    applyTransform(
      nextScale,
      clampOffset(current.x * ratio, viewport.width, nextScale),
      clampOffset(current.y * ratio, viewport.height, nextScale),
    );
  };
  const measureViewport = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const current = currentTransform.current;
    const x = clampOffset(current.x, width, current.scale);
    const y = clampOffset(current.y, height, current.scale);
    viewportWidth.value = width;
    viewportHeight.value = height;
    translateX.value = x;
    translateY.value = y;
    currentTransform.current = { ...current, x, y };
    setViewport((previous) => previous.width === width && previous.height === height ? previous : { width, height });
  };

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      gestureStartScale.value = scale.value;
      focalContentX.value = contentCoordinateAtFocal(event.focalX, viewportWidth.value, translateX.value, scale.value);
      focalContentY.value = contentCoordinateAtFocal(event.focalY, viewportHeight.value, translateY.value, scale.value);
    })
    .onUpdate((event) => {
      const nextScale = clamp(gestureStartScale.value * event.scale, MIN_SCALE, MAX_SCALE);
      scale.value = nextScale;
      translateX.value = offsetForFocal(focalContentX.value, event.focalX, viewportWidth.value, nextScale);
      translateY.value = offsetForFocal(focalContentY.value, event.focalY, viewportHeight.value, nextScale);
    })
    // Reanimated evaluates this callback as a worklet after render.
    // eslint-disable-next-line react-hooks/refs
    .onFinalize(() => runOnJS(rememberTransform)(scale.value, translateX.value, translateY.value));
  const pan = Gesture.Pan()
    .maxPointers(1)
    .averageTouches(true)
    .onChange((event) => {
      if (event.numberOfPointers === 1 && scale.value > MIN_SCALE) {
        translateX.value = clampOffset(translateX.value + event.changeX, viewportWidth.value, scale.value);
        translateY.value = clampOffset(translateY.value + event.changeY, viewportHeight.value, scale.value);
      }
    })
    // Reanimated evaluates this callback as a worklet after render.
    // eslint-disable-next-line react-hooks/refs
    .onFinalize(() => runOnJS(rememberTransform)(scale.value, translateX.value, translateY.value));
  const gestures = Gesture.Simultaneous(pinch, pan);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[styles.root, style]}>
      <View style={styles.viewport} onLayout={measureViewport}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <GestureDetector gesture={gestures}>
            <Animated.View style={[styles.canvas, viewport, animatedStyle]}>
              <StampImage source={source} accessibilityLabel={accessibilityLabel} resizeMode="contain" style={styles.image} />
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </View>
      <View style={styles.controls}>
        <IconButton label={labels.zoomOut} disabled={requestedScale <= MIN_SCALE} onPress={() => applyScale(currentTransform.current.scale - 1)}>
          <ZoomOut accessible={false} color={theme.colors.ink} size={20} strokeWidth={2} />
        </IconButton>
        <IconButton label={labels.reset} disabled={requestedScale <= MIN_SCALE} onPress={() => applyTransform(MIN_SCALE, 0, 0)}>
          <Scan accessible={false} color={theme.colors.ink} size={20} strokeWidth={2} />
        </IconButton>
        <IconButton label={labels.zoomIn} disabled={requestedScale >= MAX_SCALE} onPress={() => applyScale(currentTransform.current.scale + 1)}>
          <ZoomIn accessible={false} color={theme.colors.ink} size={20} strokeWidth={2} />
        </IconButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: theme.spacing.md },
  viewport: { flex: 1, minHeight: 260, overflow: 'hidden', backgroundColor: theme.colors.bgPage },
  gestureRoot: { flex: 1 },
  canvas: { alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', minHeight: 0, backgroundColor: theme.colors.bgPage },
  controls: { minHeight: theme.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
});
