import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, Notice, SummaryRow } from '../primitives';
import { FilterChip } from '../components/FilterChip';
import { AppIcon } from '../components/AppIcon';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { LocalePreference, SettingsScreenProps } from '../contract';

export function SettingsScreen({ locale, locale_preference, model_status, has_unsaved_work, onBack, onChangeLocale, onLogout }: SettingsScreenProps) {
  const copy = getBasicCopy(locale);
  const modelStatus = ({ ready: copy.ready, 'not-connected': copy.modelUnprepared, unprepared: copy.modelUnprepared, preparing: copy.modelLoading, failed: copy.modelFailed } as const)[model_status];
  const localeLabel = (value: LocalePreference) => value === 'system' ? copy.system : value === 'ko' ? copy.korean : copy.english;
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><IconButton label={copy.back} onPress={onBack}><AppIcon name="arrow-left" size={20} color={theme.colors.ink} /></IconButton><Text accessibilityRole="header" style={styles.title}>{copy.settings}</Text><View style={styles.spacer} /></View>
      <Text style={styles.sectionLabel}>{copy.language}</Text>
      <View style={styles.chips}>{(['system', 'ko', 'en'] as LocalePreference[]).map((value) => <FilterChip key={value} label={localeLabel(value)} selected={locale_preference === value} onPress={() => onChangeLocale(value)} />)}</View>
      <SummaryRow label={copy.model} value={model_status === 'preparing' ? <View accessible accessibilityRole="text" accessibilityLabel={`${copy.model}, ${modelStatus}`} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.status}><ActivityIndicator color={theme.colors.accent} /><Text style={styles.statusText}>{modelStatus}</Text></View> : modelStatus} />
      {has_unsaved_work ? <Notice message={copy.unsaved} tone="warning" /> : null}
      <Button label={copy.logout} onPress={onLogout} tone="secondary" />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }, header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, color: theme.colors.ink, fontSize: 20, lineHeight: 30, fontWeight: '600' }, spacer: { width: 48 }, sectionLabel: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, status: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }, statusText: { color: theme.colors.accent, fontSize: 16, lineHeight: 24 },
});
