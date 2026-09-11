import React, { ReactNode, RefObject, useState } from 'react';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { IconButton } from './IconButton';
import { useModalA11y } from './modalA11y';
import { useEntranceProgress } from './motion';
import { SemanticText } from './SemanticText';

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);
type Style = StyleProp<ViewStyle>;

export type SheetProps = {
  title: string;
  onRequestClose: () => void;
  onDismiss?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  visible?: boolean;
  closeLabel?: string;
  initialFocusRef?: RefObject<unknown | null>;
  restoreFocusRef?: RefObject<unknown | null>;
  style?: Style;
};

export function Sheet({
  title,
  onRequestClose,
  onDismiss,
  children,
  footer,
  visible = true,
  closeLabel = `${title} 닫기`,
  initialFocusRef,
  restoreFocusRef,
  style,
}: SheetProps) {
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const overflows = viewportHeight > 0 && contentHeight > viewportHeight + 1;
  const dialogRef = useModalA11y({ visible, initialFocusRef, restoreFocusRef });
  const { progress, reduceMotion } = useEntranceProgress(visible);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.92, 1]),
    transform: [{ translateY: reduceMotion ? 0 : interpolate(progress.value, [0, 1], [theme.motion.sheetOffset, 0]) }],
  }));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onRequestClose} onDismiss={onDismiss} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
        <Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <KeyboardAvoidingView pointerEvents="box-none" style={styles.alignEnd} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <AnimatedSafeAreaView
            ref={dialogRef}
            edges={['right', 'bottom', 'left']}
            accessibilityViewIsModal={Platform.OS !== 'web'}
            style={[styles.sheet, style, sheetStyle]}
          >
            <View style={styles.header}>
              <SemanticText accessibilityRole="header" style={styles.title}>{title}</SemanticText>
              <IconButton label={closeLabel} onPress={onRequestClose} icon="x" />
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={(_width, height) => setContentHeight(height)}
              onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
              scrollEnabled={overflows}
              bounces={overflows}
              alwaysBounceVertical={false}
              overScrollMode="never"
              showsVerticalScrollIndicator={overflows}
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </AnimatedSafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  scrim: { backgroundColor: theme.colors.scrim },
  alignEnd: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: theme.radii.sheet,
    borderTopRightRadius: theme.radii.sheet,
    backgroundColor: theme.colors.bgSurface,
    ...theme.shadows.high,
  },
  header: {
    minHeight: 72,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  title: {
    flex: 1,
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.heading.fontSize,
    lineHeight: theme.typography.heading.lineHeight,
    fontWeight: '400',
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
