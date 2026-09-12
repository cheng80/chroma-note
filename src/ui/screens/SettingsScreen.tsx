import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Screen } from '../primitives';
import { FilterChip } from '../components/FilterChip';
import { AppIcon } from '../components/AppIcon';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import { useEntranceProgress } from '../components/motion';
import { SemanticText } from '../components/SemanticText';
import type { LocalePreference, SettingsScreenProps } from '../contract';

export function SettingsScreen({ locale, locale_preference, model_status, onBack, onChangeLocale, onLogout, onRetryModel, logoutTriggerRef }: SettingsScreenProps) {
  const copy = getBasicCopy(locale);
  const { reduceMotion } = useEntranceProgress(true);
  const modelStatus = ({ ready: copy.ready, 'not-connected': copy.modelUnprepared, unprepared: copy.modelUnprepared, preparing: copy.modelLoading, failed: copy.modelFailed } as const)[model_status];
  const localeLabel = (value: LocalePreference) => value === 'system' ? copy.system : value === 'ko' ? copy.korean : copy.english;
  const modelValue = model_status === 'preparing' ? <View accessible accessibilityRole="text" accessibilityLabel={`${copy.model}, ${modelStatus}`} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.status}>{reduceMotion ? <AppIcon name="refresh-cw" color={theme.colors.accent} /> : <ActivityIndicator color={theme.colors.accent} />}<SemanticText style={styles.statusText}>{modelStatus}</SemanticText></View> : modelStatus;
  return <Screen title={copy.settings} onBack={onBack} backLabel={copy.back} contentStyle={styles.content}>
      <View style={styles.section}>
        <SemanticText style={styles.sectionLabel}>{copy.language}</SemanticText>
        <SemanticText style={styles.sectionValue}>{localeLabel(locale_preference)}</SemanticText>
        <View style={styles.chips}>{(['system', 'ko', 'en'] as LocalePreference[]).map((value) => <FilterChip key={value} label={localeLabel(value)} selected={locale_preference === value} onPress={() => onChangeLocale(value)} />)}</View>
      </View>
      <View style={styles.section}>
        <SemanticText style={styles.sectionLabel}>{copy.model}</SemanticText>
        {typeof modelValue === 'string' ? <SemanticText style={styles.sectionValue}>{modelValue}</SemanticText> : modelValue}
        {model_status === 'failed' && onRetryModel ? <Button label={locale === 'ko' ? '모델 준비 다시 시도' : 'Retry model preparation'} onPress={onRetryModel} tone="secondary" /> : null}
      </View>
      <View style={styles.section}>
        <SemanticText style={styles.sectionLabel}>{copy.originalPhoto}</SemanticText>
        <SemanticText style={styles.sectionValue}>{copy.onThisDevice}</SemanticText>
        <View style={styles.accountRecords}><SemanticText style={styles.accountLabel}>{copy.accountRecords}</SemanticText><SemanticText style={styles.accountText}>{copy.accountStorage}</SemanticText></View>
      </View>
      <Button ref={logoutTriggerRef} label={copy.logout} onPress={onLogout} tone="secondary" />
      <SemanticText style={styles.unsaved}>{copy.unsaved}</SemanticText>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.sm, gap: theme.spacing.lg }, section: { gap: theme.spacing.md }, sectionLabel: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.body.fontSize, lineHeight: theme.typography.body.lineHeight, fontWeight: '600' }, sectionValue: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.body.fontSize, lineHeight: theme.typography.body.lineHeight }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }, status: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }, statusText: { color: theme.colors.accent, fontSize: theme.typography.body.fontSize, lineHeight: theme.typography.body.lineHeight }, accountRecords: { borderTopWidth: 1, paddingTop: theme.spacing.md, borderTopColor: theme.colors.borderSubtle, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle, gap: theme.spacing.xs, paddingBottom: theme.spacing.md }, accountLabel: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.secondary.fontSize, lineHeight: theme.typography.secondary.lineHeight }, accountText: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.body.fontSize, lineHeight: theme.typography.body.lineHeight }, unsaved: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.caption.fontSize, lineHeight: theme.typography.caption.lineHeight },
});
