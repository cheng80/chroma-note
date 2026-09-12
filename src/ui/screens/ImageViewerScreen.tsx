import React from 'react';
import { StyleSheet } from 'react-native';

import type { ImageViewerScreenProps } from '../contract';
import { ZoomableImage } from '../components/ZoomableImage';
import { Button, Screen } from '../primitives';
import { recordCopy } from '../record-copy';
import { theme } from '../theme';

export function ImageViewerScreen({ locale, source, accessibilityLabel, onClose, showConversionNotice }: ImageViewerScreenProps) {
  const t = recordCopy[locale];
  return (
    <Screen title={t.viewer} onBack={onClose} backLabel={t.back} scrollable={false} footer={<Button label={t.close} onPress={onClose} tone="secondary" />} contentStyle={styles.content}>
      <ZoomableImage showConversionNotice={showConversionNotice} locale={locale} source={source} accessibilityLabel={accessibilityLabel} style={styles.frame} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, maxWidth: '100%' },
  frame: { flex: 1, width: '100%', minHeight: 0, backgroundColor: theme.colors.bgPage },
});
