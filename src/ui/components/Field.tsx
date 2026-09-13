import React, { forwardRef, useState } from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useFieldFeedback } from './motion';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type Style = StyleProp<ViewStyle>;

export type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  containerStyle?: Style;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, containerStyle, accessibilityHint, onBlur, onFocus, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const animatedStyle = useFieldFeedback(focused && props.editable !== false, error);
  return (
    <View style={[styles.container, containerStyle]}>
      <SemanticText style={styles.label}>{label}</SemanticText>
      <AnimatedTextInput
        ref={ref}
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={error ?? accessibilityHint}
        accessibilityState={{ ...props.accessibilityState, disabled: props.editable === false }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[styles.field, animatedStyle, props.style]}
        placeholderTextColor={props.placeholderTextColor ?? theme.colors.inkSecondary}
      />
      {error ? <SemanticText accessibilityRole="alert" style={styles.errorText}>{error}</SemanticText> : hint ? <SemanticText style={styles.hint}>{hint}</SemanticText> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm },
  label: {
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.secondary.fontSize,
    lineHeight: theme.typography.secondary.lineHeight,
    fontWeight: '600',
  },
  field: {
    minHeight: theme.buttonHeight,
    borderRadius: theme.radii.field,
    borderWidth: 2,
    borderColor: theme.colors.borderControl,
    backgroundColor: theme.colors.bgSurface,
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body.fontSize,
    lineHeight: theme.typography.body.lineHeight,
    paddingHorizontal: theme.spacing.lg - 1,
    paddingVertical: 13,
  },
  hint: {
    color: theme.colors.inkSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: theme.typography.caption.lineHeight,
  },
  errorText: {
    color: theme.colors.danger,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: theme.typography.caption.lineHeight,
  },
});
