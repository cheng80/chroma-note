import React, { ReactNode, useState } from 'react';
import Animated from 'react-native-reanimated';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppIcon, AppIconName } from './AppIcon';
import { usePressScale } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
type Style = StyleProp<ViewStyle>;

export type IconButtonProps = {
  label: string;
  onPress: () => void;
  children?: ReactNode;
  icon?: AppIconName;
  disabled?: boolean;
  style?: Style;
  accessibilityHint?: string;
  testID?: string;
};

function IconContent({ children }: { children?: ReactNode }) {
  return children == null || typeof children === 'string' || typeof children === 'number' ? <AppIcon name="ellipsis" /> : children;
}

export function IconButton({
  label,
  onPress,
  children,
  icon,
  disabled = false,
  style,
  accessibilityHint,
  testID,
}: IconButtonProps) {
  const [focused, setFocused] = useState(false);
  const { animatedStyle, setPressed } = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      testID={testID}
      style={[styles.iconButton, disabled && styles.disabled, focused && styles.focused, style, animatedStyle]}
    >
      {icon ? <AppIcon name={icon} /> : <IconContent>{children}</IconContent>}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: theme.touchTarget,
    height: theme.touchTarget,
    borderRadius: theme.radii.control,
    borderColor: theme.colors.borderControl,
    borderWidth: 1,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.low,
  },
  disabled: { backgroundColor: theme.colors.bgDisabled, boxShadow: 'none' },
  focused: {
    outlineColor: theme.colors.borderFocus,
    outlineOffset: 4,
    outlineStyle: 'solid',
    outlineWidth: 2,
  },
});
