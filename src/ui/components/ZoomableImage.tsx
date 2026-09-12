import React, { useRef, useState } from 'react';
import { Scan, ZoomIn, ZoomOut } from 'lucide-react-native';
import {
  ImageSourcePropType,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import type { DisplayLocale } from '../contract';
import { theme } from '../theme';
import { IconButton } from './IconButton';
import { useLiveReduceMotion } from './motion';
import { StampImage } from './StampImage';
import { LineArtDisclaimer } from './LineArtDisclaimer';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

type ZoomableImageProps = {
  locale: DisplayLocale;
  source: ImageSourcePropType;
  accessibilityLabel: string;
  showConversionNotice?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ZoomableImage({ locale, source, accessibilityLabel, style, showConversionNotice = false }: ZoomableImageProps) {
  const reduceMotion = useLiveReduceMotion();
  const currentScale = useRef(MIN_SCALE);
  const [requestedScale, setRequestedScale] = useState(MIN_SCALE);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const labels = locale === 'ko'
    ? { zoomIn: '확대', zoomOut: '축소', reset: '원래 크기' }
    : { zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Actual size' };

  const applyScale = (value: number) => {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
    currentScale.current = next;
    setRequestedScale(next);
  };
  const rememberScale = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScale.current = event.nativeEvent.zoomScale || MIN_SCALE;
  };
  const finishGesture = () => setRequestedScale(currentScale.current);
  const measureViewport = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => current.width === width && current.height === height ? current : { width, height });
  };

  return (
    <View style={[styles.root, style]}>
      <View style={styles.viewport} onLayout={measureViewport}>
        <ScrollView
          automaticallyAdjustContentInsets={false}
          bounces={false}
          bouncesZoom={!reduceMotion}
          centerContent
          contentInsetAdjustmentBehavior="never"
          maximumZoomScale={MAX_SCALE}
          minimumZoomScale={MIN_SCALE}
          onMomentumScrollEnd={finishGesture}
          onScroll={rememberScale}
          onScrollEndDrag={finishGesture}
          overScrollMode="never"
          pinchGestureEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          zoomScale={requestedScale}
        >
          <View style={[styles.canvas, viewport]}>
            <StampImage source={source} accessibilityLabel={accessibilityLabel} resizeMode="contain" style={styles.image} />
          </View>
        </ScrollView>
      </View>
      {showConversionNotice ? <LineArtDisclaimer locale={locale} /> : null}
      <View style={styles.controls}>
        <IconButton label={labels.zoomOut} disabled={requestedScale <= MIN_SCALE} onPress={() => applyScale(currentScale.current - 1)}>
          <ZoomOut accessible={false} color={theme.colors.ink} size={20} strokeWidth={2} />
        </IconButton>
        <IconButton label={labels.reset} disabled={requestedScale <= MIN_SCALE} onPress={() => applyScale(MIN_SCALE)}>
          <Scan accessible={false} color={theme.colors.ink} size={20} strokeWidth={2} />
        </IconButton>
        <IconButton label={labels.zoomIn} disabled={requestedScale >= MAX_SCALE} onPress={() => applyScale(currentScale.current + 1)}>
          <ZoomIn accessible={false} color={theme.colors.ink} size={20} strokeWidth={2} />
        </IconButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: theme.spacing.md },
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: theme.colors.bgPage },
  scroll: { flex: 1 },
  canvas: { alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', minHeight: 0, backgroundColor: theme.colors.bgPage },
  controls: { minHeight: theme.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
});
