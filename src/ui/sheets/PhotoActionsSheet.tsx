import React from 'react';
import { StyleSheet, Text } from 'react-native';

import type { DisplayLocale, StampCandidate } from '../contract';
import type { ImageSourcePropType } from 'react-native';
import { Button, Sheet, StampImage } from '../primitives';
import { imageSource, recordCopy } from '../record-copy';
import { theme } from '../theme';

type PhotoActionsSheetProps = {
  locale: DisplayLocale;
  candidate: StampCandidate | null;
  fallbackImage: ImageSourcePropType;
  busy: boolean;
  onAdopt: (candidateId: string) => void;
  onRegenerate: () => void;
  onReplacePhoto: () => void;
  onClose: () => void;
};

export function PhotoActionsSheet({ locale, candidate, fallbackImage, busy, onAdopt, onRegenerate, onReplacePhoto, onClose }: PhotoActionsSheetProps) {
  const t = recordCopy[locale];
  return (
    <Sheet title={t.photoActions} onRequestClose={onClose} footer={<Button label={t.close} onPress={onClose} tone="secondary" />}>
      {candidate ? <><StampImage source={imageSource(candidate.local_uri, fallbackImage)} accessibilityLabel={t.candidate} resizeMode="contain" style={styles.candidate} /><Button label={t.adopt} onPress={() => onAdopt(candidate.candidate_id)} disabled={busy} /></> : null}
      <Button label={t.regenerate} onPress={onRegenerate} disabled={busy} />
      <Button label={t.changePhoto} onPress={onReplacePhoto} disabled={busy} />
      <Text style={styles.hint}>{t.photoActionsHint}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  candidate: { minHeight: 120, maxHeight: 180, backgroundColor: theme.colors.bgPage },
  hint: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
});
