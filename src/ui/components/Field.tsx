import React, { forwardRef, useState } from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';

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
  return (
    <View style={[styles.container, containerStyle]}>
      <SemanticText style={styles.label}>{label}</SemanticText>
      <TextInput
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
        style={[styles.field, focused && styles.focused, error && styles.errorField, props.style]}
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
    borderWidth: 1,
    borderColor: theme.colors.borderControl,
    backgroundColor: theme.colors.bgSurface,
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body.fontSize,
    lineHeight: theme.typography.body.lineHeight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
  },
  focused: { borderColor: theme.colors.borderFocus, borderWidth: 2 },
  errorField: { borderColor: theme.colors.danger },
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
