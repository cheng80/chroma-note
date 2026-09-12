import React, { RefObject, useRef } from 'react';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { Modal, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Button } from './Button';
import { useModalA11y } from './modalA11y';
import { useEntranceProgress } from './motion';
import { SemanticText } from './SemanticText';

type Style = StyleProp<ViewStyle>;

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
  destructive?: boolean;
  visible?: boolean;
  cancelLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  initialFocusRef?: RefObject<unknown | null>;
  restoreFocusRef?: RefObject<unknown | null>;
  style?: Style;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  onDismiss,
  destructive = false,
  visible = true,
  cancelLabel = '취소',
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  initialFocusRef,
  restoreFocusRef,
  style,
}: ConfirmDialogProps) {
  const cancelRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const confirmRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const { dialogRef, onShow } = useModalA11y({ visible, initialFocusRef: initialFocusRef ?? cancelRef, restoreFocusRef });
  const { progress, reduceMotion } = useEntranceProgress(visible);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : interpolate(progress.value, [0, 1], [theme.motion.dialogScale, 1]) }],
  }));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel} onShow={onShow} onDismiss={onDismiss} statusBarTranslucent>
      <SafeAreaProvider style={styles.modalRoot}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
        <Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill} onPress={onCancel} />
        <SafeAreaView edges={['top', 'right', 'bottom', 'left']} pointerEvents="box-none" style={styles.safeArea}>
          <View pointerEvents="box-none" style={styles.center}>
            <Animated.View
              ref={dialogRef}
              accessibilityViewIsModal={Platform.OS !== 'web'}
              style={[styles.card, style, cardStyle]}
            >
              <SemanticText accessibilityRole="header" style={styles.title}>{title}</SemanticText>
              <SemanticText style={styles.message}>{message}</SemanticText>
              <Button ref={confirmRef} label={confirmLabel} onPress={onConfirm} tone={destructive ? 'destructive' : 'primary'} />
              {secondaryLabel && onSecondary ? <Button label={secondaryLabel} onPress={onSecondary} disabled={secondaryDisabled} tone="secondary" /> : null}
              <Button ref={cancelRef} label={cancelLabel} onPress={onCancel} tone="secondary" />
            </Animated.View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  scrim: { backgroundColor: theme.colors.scrim },
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing['2xl'] },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: theme.radii.dialog,
    backgroundColor: theme.colors.bgSurface,
    padding: theme.spacing['2xl'],
    gap: theme.spacing.lg,
    ...theme.shadows.high,
  },
  title: {
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.heading.fontSize,
    lineHeight: theme.typography.heading.lineHeight,
    fontWeight: '600',
  },
  message: {
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body.fontSize,
    lineHeight: theme.typography.body.lineHeight,
  },
});
