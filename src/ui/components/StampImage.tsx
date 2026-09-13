import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { theme } from '../theme';
import { AppIcon } from './AppIcon';
import { LoadingSkeleton } from './LoadingSkeleton';
import { useLiveReduceMotion } from './motion';
import { SemanticText } from './SemanticText';

export type StampImageProps = Omit<ImageProps, 'source'> & {
  source: ImageSourcePropType;
  processing?: boolean;
  reveal?: 'fade' | 'pop' | 'none';
  completionLabel?: string;
};

export function StampImage(props: StampImageProps) {
  // Reset native loading state on source/auth changes; late callbacks stay in the old instance.
  return <ImageContent key={JSON.stringify(props.source)} {...props} />;
}

function ImageContent({ source, accessibilityLabel, style, processing = false, reveal = 'fade', completionLabel, onLoad, onLoadStart, onError, ...props }: StampImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const reduceMotion = useLiveReduceMotion();
  const appearance = useSharedValue(0);
  const scale = useSharedValue(1);
  const badge = useSharedValue(0);
  const animated = reveal !== 'none' && !reduceMotion;
  useEffect(() => {
    cancelAnimation(appearance);
    cancelAnimation(scale);
    cancelAnimation(badge);
    const loaded = status === 'loaded';
    appearance.value = withTiming(processing || loaded ? 1 : 0, { duration: animated ? 220 : 0, reduceMotion: animated ? ReduceMotion.Never : ReduceMotion.Always });
    scale.value = 1;
    badge.value = 0;
    if (loaded && !processing && reveal === 'pop') {
      badge.value = 1;
      badge.value = withDelay(1800, withTiming(0, { duration: animated ? 200 : 0, reduceMotion: animated ? ReduceMotion.Never : ReduceMotion.Always }));
    }
    if (loaded && !processing && reveal === 'pop' && animated) {
      scale.value = 0.92;
      scale.value = withSpring(1, { stiffness: 210, damping: 11, mass: 0.7, reduceMotion: ReduceMotion.Never });
    }
    return () => { cancelAnimation(appearance); cancelAnimation(scale); cancelAnimation(badge); };
  }, [animated, appearance, badge, processing, reveal, scale, status]);
  const imageStyle = useAnimatedStyle(() => ({ opacity: processing || reveal === 'none' ? 1 : appearance.value }));
  const revealStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value }));
  const loading = reveal !== 'none' && status !== 'error' && (processing || status === 'loading');
  return (
    <Animated.View style={[styles.image, style as StyleProp<ViewStyle>, revealStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
      <Image
        {...props}
        source={source}
        fadeDuration={reveal === 'none' ? 0 : props.fadeDuration}
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        resizeMode={props.resizeMode ?? 'contain'}
        style={[StyleSheet.absoluteFill, styles.content]}
        // A cached iOS image can emit loadStart after load. The source key already resets loading.
        onLoadStart={onLoadStart}
        onLoad={event => { setStatus('loaded'); onLoad?.(event); }}
        onError={event => { setStatus('error'); onError?.(event); }}
      />
      </Animated.View>
      {loading ? <LoadingSkeleton overlay={processing} style={StyleSheet.absoluteFill} /> : null}
      {status === 'loaded' && !processing && reveal === 'pop' && completionLabel ? <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.completed, badgeStyle]}><AppIcon name="circle-check" color={theme.colors.success} size={20} /><SemanticText style={styles.completionText}>{completionLabel}</SemanticText></Animated.View> : null}
      {status === 'error' && reveal !== 'none' ? <View style={styles.missing}><AppIcon name="image" size={28} color={theme.colors.inkSecondary} /></View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    backgroundColor: theme.colors.bgSunken,
    borderWidth: 1,
    borderColor: '#0000001A',
    borderRadius: theme.radii.image,
    overflow: 'hidden',
  },
  content: { width: '100%', height: '100%' },
  completed: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.bgSurface, padding: 12, borderRadius: theme.radii.control },
  completionText: { flex: 1, color: theme.colors.success, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  missing: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
