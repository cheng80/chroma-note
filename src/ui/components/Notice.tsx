import React, { useEffect, useRef } from 'react';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppIcon, AppIconName } from './AppIcon';
import { useEntranceProgress } from './motion';
import { SemanticText } from './SemanticText';

type Style = StyleProp<ViewStyle>;
export type NoticeTone = 'info' | 'warning' | 'success' | 'error';

export type NoticeProps = {
  message: string;
  title?: string;
  tone?: NoticeTone;
  busy?: boolean;
  style?: Style;
};

const toneIcons: Record<NoticeTone, AppIconName> = {
  info: 'info',
  warning: 'triangle-alert',
  success: 'circle-check',
  error: 'circle-alert',
};

export function Notice({ message, title, tone = 'info', busy = false, style }: NoticeProps) {
  const { progress, reduceMotion } = useEntranceProgress(true, theme.motion.noticeDuration, `${tone}:${busy}:${title}:${message}`);
  const arrival = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const success = tone === 'success' && !busy;
  const previousSuccess = useRef(false);
  useEffect(() => {
    cancelAnimation(arrival);
    arrival.value = reduceMotion ? 1 : 0;
    if (!reduceMotion) arrival.value = withSpring(1, { stiffness: 280, damping: 22, reduceMotion: ReduceMotion.Never });
    return () => cancelAnimation(arrival);
  }, [arrival, busy, message, reduceMotion, title, tone]);
  useEffect(() => {
    cancelAnimation(iconScale);
    const completed = success && !previousSuccess.current;
    previousSuccess.current = success;
    iconScale.value = completed && !reduceMotion ? 0.7 : 1;
    if (completed && !reduceMotion) iconScale.value = withSpring(1, { stiffness: 320, damping: 16, reduceMotion: ReduceMotion.Never });
    return () => cancelAnimation(iconScale);
  }, [iconScale, reduceMotion, success]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - arrival.value) * 10 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: reduceMotion ? 1 : iconScale.value }] }));
  return (
    <Animated.View
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityState={{ busy }}
      style={[styles.notice, toneStyles[tone], style, animatedStyle]}
    >
      <Animated.View style={iconStyle}>{busy && !reduceMotion ? <ActivityIndicator color={toneColors[tone]} /> : <AppIcon name={busy ? 'refresh-cw' : toneIcons[tone]} color={toneColors[tone]} />}</Animated.View>
      <View style={styles.body}>
        {title ? <SemanticText style={[styles.title, { color: toneColors[tone] }]}>{title}</SemanticText> : null}
        <SemanticText style={[styles.message, { color: tone === 'info' ? theme.colors.ink : toneColors[tone] }]}>{message}</SemanticText>
      </View>
    </Animated.View>
  );
}

const toneColors = {
  info: theme.colors.accent,
  warning: theme.colors.warning,
  success: theme.colors.success,
  error: theme.colors.danger,
} as const;

const toneStyles = StyleSheet.create({
  info: { backgroundColor: theme.colors.accentSubtle },
  warning: { backgroundColor: theme.colors.warningSubtle },
  success: { backgroundColor: theme.colors.successSubtle },
  error: { backgroundColor: theme.colors.dangerSubtle },
});

const styles = StyleSheet.create({
  notice: {
    minHeight: theme.touchTarget,
    borderRadius: theme.radii.control,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  body: { flex: 1, gap: theme.spacing.xs },
  title: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.secondary.fontSize,
    lineHeight: theme.typography.secondary.lineHeight,
    fontWeight: '600',
  },
  message: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.secondary.fontSize,
    lineHeight: theme.typography.secondary.lineHeight,
  },
});
