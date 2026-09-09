import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PhotoInputScreenProps } from '../contract';
import { Button, Screen, StampImage } from '../primitives';
import { displayDate, imageSource, recordCopy } from '../record-copy';
import { theme } from '../theme';

export function PhotoInputScreen({ locale, images, draft, onUseDemoPhoto, onContinue, onCancel, onRequestReplace }: PhotoInputScreenProps) {
  const t = recordCopy[locale];
  const hasPhoto = Boolean(draft?.photo);
  const source = draft ? imageSource(draft.photo.local_uri, images.photo) : images.photo;
  const footer = hasPhoto ? <><Button label={t.continuePhoto} onPress={onContinue} /><Button label={t.replacePhoto} onPress={onRequestReplace} tone="secondary" /></> : <Button label={t.useDemo} onPress={onUseDemoPhoto} />;

  return (
    <Screen title={t.photoHeader} onBack={onCancel} backLabel={t.back} footer={footer} contentStyle={styles.content}>
      <Text style={styles.eyebrow}>{t.photoStep}</Text>
      <StampImage source={source} accessibilityLabel={t.selectedPhoto} resizeMode="contain" style={styles.photo} />
      <Text accessibilityRole="header" style={styles.title}>{t.photoTitle}</Text>
      <Text style={styles.body}>{t.photoBody}</Text>
      {draft ? <View style={styles.dateBlock}><Text style={styles.label}>{t.date}</Text><Text style={styles.date}>{displayDate(draft.fields.diary_date)}</Text><Text style={styles.hint}>{t.dateHint}</Text></View> : null}
      <View style={styles.spacer} />
      <Text style={styles.auxiliary}>{t.photoLifetime}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.sm, gap: theme.spacing.lg },
  eyebrow: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  photo: { height: 230, backgroundColor: theme.colors.bgPage },
  title: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 28, lineHeight: 42, fontWeight: '600' },
  body: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  dateBlock: { gap: theme.spacing.sm },
  label: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  date: { minHeight: 52, paddingHorizontal: theme.spacing.lg, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderControl, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 16, lineHeight: 24 },
  hint: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  spacer: { flex: 1 },
  auxiliary: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
});
