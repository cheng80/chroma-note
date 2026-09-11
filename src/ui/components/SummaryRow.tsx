import React, { ReactNode, useState } from 'react';
import Reanimated from 'react-native-reanimated';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppIcon } from './AppIcon';
import { usePressScale } from './motion';

type Style = StyleProp<ViewStyle>;
const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export type SummaryRowProps = {
  label: string;
  value: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: Style;
  accessibilityHint?: string;
};

export function SummaryRow({ label, value, onPress, disabled = false, style, accessibilityHint }: SummaryRowProps) {
  const [pressed, setPressedState] = useState(false);
  const { animatedStyle, setPressed } = usePressScale();
  const valueText = typeof value === 'string' || typeof value === 'number';
  const content = (
    <>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {valueText ? <Text style={[styles.value, disabled && styles.disabledText]}>{value}</Text> : value}
      </View>
      {onPress ? <AppIcon name="chevron-right" color={theme.colors.inkSecondary} /> : null}
    </>
  );

  return onPress ? (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={valueText ? `${label}, ${value}` : undefined}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => { setPressedState(true); setPressed(true); }}
      onPressOut={() => { setPressedState(false); setPressed(false); }}
      onPress={onPress}
      style={[styles.row, pressed && !disabled && styles.pressed, style, animatedStyle]}
    >
      {content}
    </AnimatedPressable>
  ) : <View style={[styles.row, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.touchTarget,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    gap: theme.spacing.md,
  },
  copy: { flex: 1, gap: theme.spacing.xs },
  label: {
    color: theme.colors.inkSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.secondary.fontSize,
    lineHeight: theme.typography.secondary.lineHeight,
  },
  value: {
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body.fontSize,
    lineHeight: theme.typography.body.lineHeight,
  },
  disabledText: { color: theme.colors.inkDisabled },
  pressed: { backgroundColor: theme.colors.accentSubtle },
});
