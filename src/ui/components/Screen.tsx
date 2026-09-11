import React, { ReactNode, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { IconButton } from './IconButton';
import { SemanticText } from './SemanticText';

type Style = StyleProp<ViewStyle>;

export type ScreenProps = {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scrollable?: boolean;
  backLabel?: string;
  brand?: boolean;
  style?: Style;
  contentStyle?: Style;
  accessibilityLabel?: string;
};

export function Screen({
  title,
  onBack,
  actions,
  children,
  footer,
  scrollable = true,
  backLabel = '뒤로가기',
  brand = false,
  style,
  contentStyle,
  accessibilityLabel,
}: ScreenProps) {
  const scroll = useRef<ScrollView>(null);
  const body = scrollable ? (
    <ScrollView
      ref={scroll}
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      indicatorStyle="black"
      onContentSizeChange={() => scroll.current?.flashScrollIndicators()}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.staticContent, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={footer ? ['top', 'right', 'left'] : ['top', 'right', 'bottom', 'left']} style={[styles.screen, style]} accessibilityLabel={accessibilityLabel}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {onBack ? <IconButton label={backLabel} onPress={onBack} accessibilityHint="이전 화면으로 돌아갑니다" icon="arrow-left" /> : null}
          <SemanticText accessibilityRole="header" style={[styles.title, brand && styles.brand]} numberOfLines={2}>{title}</SemanticText>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
        {body}
        {footer ? <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.colors.bgPage },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.md,
  },
  title: {
    flex: 1,
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.heading.fontSize,
    lineHeight: theme.typography.heading.lineHeight,
    fontWeight: '600',
  },
  brand: {
    fontFamily: theme.typography.displayFamily,
    fontSize: theme.typography.brand.fontSize,
    lineHeight: theme.typography.brand.lineHeight,
    fontWeight: '400',
  },
  actions: { alignItems: 'flex-end', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  staticContent: { flex: 1 },
  footer: {
    backgroundColor: theme.colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderControl,
    boxShadow: '0 -4px 12px rgba(41, 40, 35, 0.08)',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
