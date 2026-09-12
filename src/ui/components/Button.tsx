import React, { forwardRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import { AccessibilityState, ActivityIndicator, Pressable, StyleProp, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';
import { usePressScale, useEntranceProgress } from './motion';
import { AppIcon } from './AppIcon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
type Style = StyleProp<ViewStyle>;

export type ButtonTone = 'primary' | 'secondary' | 'destructive' | 'subtle';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: ButtonTone;
  style?: Style;
  textStyle?: StyleProp<TextStyle>;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
};

export const Button = forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(function Button({
  label,
  onPress,
  disabled = false,
  busy = false,
  tone = 'primary',
  style,
  textStyle,
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  testID,
}: ButtonProps, ref) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressedState] = useState(false);
  const { animatedStyle, setPressed } = usePressScale();
  const { reduceMotion } = useEntranceProgress(true);
  const inactive = disabled || busy;

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityLiveRegion={busy ? 'polite' : 'none'}
      accessibilityState={{ ...accessibilityState, disabled: inactive, busy }}
      disabled={inactive}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => {
        setPressedState(true);
        setPressed(true);
      }}
      onPressOut={() => {
        setPressedState(false);
        setPressed(false);
      }}
      onPress={onPress}
      testID={testID}
      style={[
        styles.button,
        toneStyles[tone],
        busy && styles.buttonBusy,
        disabled && styles.buttonDisabled,
        pressed && pressedToneStyles[tone],
        focused && styles.focused,
        style,
        animatedStyle,
      ]}
    >
      {busy ? reduceMotion ? <AppIcon name="refresh-cw" color={theme.colors.accent} /> : <ActivityIndicator color={theme.colors.accent} /> : null}
      <SemanticText style={[styles.buttonText, busy || disabled ? styles.inactiveText : toneTextStyles[tone], textStyle]}>{label}</SemanticText>
    </AnimatedPressable>
  );
});

const toneStyles = StyleSheet.create({
  primary: { backgroundColor: theme.colors.accent, ...theme.shadows.low },
  secondary: { backgroundColor: theme.colors.bgSurface, borderColor: theme.colors.borderControl, borderWidth: 1 },
  destructive: { backgroundColor: theme.colors.danger },
  subtle: { backgroundColor: theme.colors.bgSunken, borderWidth: 1, borderColor: theme.colors.borderControl },
});

const pressedToneStyles = StyleSheet.create({
  primary: { backgroundColor: theme.colors.accentPressed },
  secondary: {},
  destructive: {},
  subtle: {},
});

const toneTextStyles = StyleSheet.create({
  primary: { color: theme.colors.inverse },
  secondary: { color: theme.colors.ink },
  destructive: { color: theme.colors.inverse },
  subtle: { color: theme.colors.ink },
});

const styles = StyleSheet.create({
  button: {
    minHeight: theme.buttonHeight,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 14,
    borderRadius: theme.radii.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  buttonText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body.fontSize,
    lineHeight: theme.typography.body.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonBusy: { backgroundColor: theme.colors.bgDisabled, borderWidth: 1, borderColor: theme.colors.borderControl, boxShadow: 'none' },
  inactiveText: { color: theme.colors.inkDisabled },
  buttonDisabled: { backgroundColor: theme.colors.bgDisabled, borderWidth: 1, borderColor: theme.colors.borderControl, boxShadow: 'none', opacity: 1 },
  focused: {
    outlineColor: theme.colors.borderFocus,
    outlineOffset: 4,
    outlineStyle: 'solid',
    outlineWidth: 2,
  },
});
