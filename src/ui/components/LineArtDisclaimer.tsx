import React from 'react';
import { StyleSheet } from 'react-native';
import type { DisplayLocale } from '../contract';
import { theme } from '../theme';
import { SemanticText } from './SemanticText';

export function LineArtDisclaimer({ locale }: { locale: DisplayLocale }) {
  return <SemanticText style={styles.caption}>{locale === 'ko'
    ? 'AI 변환 중 일부 윤곽이나 세부 표현이 생략될 수 있\u2060어요.'
    : 'AI conversion may omit some outlines or details from the original photo.'}</SemanticText>;
}

const styles = StyleSheet.create({
  caption: { ...theme.typography.caption, color: theme.colors.info, marginTop: theme.spacing.sm, textAlign: 'center' },
});
