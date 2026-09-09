import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppIcon, AppIconName } from './AppIcon';
import { useEntranceProgress } from './motion';

type Style = StyleProp<ViewStyle>;
export type NoticeTone = 'info' | 'warning' | 'success' | 'error';

export type NoticeProps = {
  message: string;
  title?: string;
  tone?: NoticeTone;
  style?: Style;
};

const toneIcons: Record<NoticeTone, AppIconName> = {
  info: 'info',
  warning: 'triangle-alert',
  success: 'circle-check',
  error: 'circle-alert',
};

export function Notice({ message, title, tone = 'info', style }: NoticeProps) {
  const { progress } = useEntranceProgress(true, theme.motion.noticeDuration, `${tone}:${title}:${message}`);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[styles.notice, toneStyles[tone], style, animatedStyle]}
    >
      <AppIcon name={toneIcons[tone]} color={toneColors[tone]} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: toneColors[tone] }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: tone === 'info' ? theme.colors.ink : toneColors[tone] }]}>{message}</Text>
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
