import React from 'react';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from './AppIcon';
import { useEntranceProgress, usePressScale } from './motion';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type ResultConfirmationProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function ResultConfirmation({ label, checked, onChange, disabled = false }: ResultConfirmationProps) {
  const { progress } = useEntranceProgress(checked, theme.motion.noticeDuration);
  const { animatedStyle, setPressed } = usePressScale();
  const checkStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: progress.value }] }));

  return (
    <AnimatedPressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} hitSlop={4} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={() => onChange(!checked)} style={[styles.root, animatedStyle]}>
      <View style={[styles.box, checked && styles.boxChecked, disabled && styles.boxDisabled]}>
        <Reanimated.View style={checkStyle}><AppIcon name="check" size={16} color={disabled ? theme.colors.inkDisabled : theme.colors.inverse} strokeWidth={2.5} /></Reanimated.View>
      </View>
      <Text style={[styles.label, disabled && styles.disabledText]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: theme.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md },
  box: { width: 24, height: 24, borderRadius: 3, borderWidth: 2, borderColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: theme.colors.accent },
  label: { flex: 1, color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  boxDisabled: { backgroundColor: theme.colors.bgDisabled, borderColor: theme.colors.borderControl },
  disabledText: { color: theme.colors.inkDisabled },
});
