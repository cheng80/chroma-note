import React from 'react';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CompareScreenProps } from '../contract';
import { AppIcon } from '../components/AppIcon';
import { useEntranceProgress, usePressScale } from '../components/motion';
import { ResultConfirmation } from '../components/ResultConfirmation';
import { LineArtDisclaimer } from '../components/LineArtDisclaimer';
import { SemanticText } from '../components/SemanticText';
import { Button, IconButton, Notice, Screen, StampImage } from '../primitives';
import { imageSource, recordCopy } from '../record-copy';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

function Tab({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled: boolean }) {
  const { animatedStyle, setPressed } = usePressScale();
  return (
    <AnimatedPressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onPress} style={[styles.tab, selected && styles.tabSelected, disabled && styles.disabled, animatedStyle]}>
      {selected ? <View pointerEvents="none" style={styles.tabCheck}><AppIcon name="check" size={16} color={theme.colors.accent} strokeWidth={2} /></View> : null}
      <SemanticText style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{label}</SemanticText>
    </AnimatedPressable>
  );
}

export function CompareScreen({ locale, images, draft, active_tab, busy, blocking_reason, onBack, onChangeTab, onOpenOriginal, onConfirmChange, onContinue, onRequestReplacePhoto, replacePhotoTriggerRef }: CompareScreenProps) {
  const t = recordCopy[locale];
  const selected = draft.selected_candidate;
  const checked = Boolean(selected && draft.confirmation?.candidate_id === selected.candidate_id && draft.confirmation.input_revision === draft.input_revision);
  const source = active_tab === 'photo' ? imageSource(draft.photo.local_uri, images.photo) : selected ? imageSource(selected.local_uri, images.stamp) : images.stamp;
  const { progress } = useEntranceProgress(true, theme.motion.enterDuration, `${active_tab}:${selected?.candidate_id ?? ''}`);
  const imageStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Screen title={t.compareHeader} onBack={onBack} backLabel={t.back} actions={<IconButton ref={replacePhotoTriggerRef} label={t.changePhoto} icon="image" onPress={onRequestReplacePhoto} disabled={busy} />} footer={<Button label={checked ? t.next : t.continueCompare} onPress={onContinue} disabled={!checked || busy} busy={busy} tone={checked ? 'primary' : 'subtle'} />} contentStyle={styles.content}>
      <View style={styles.tabRow}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <Tab label={t.photo} selected={active_tab === 'photo'} onPress={() => onChangeTab('photo')} disabled={busy} />
          <Tab label={t.stamp} selected={active_tab === 'stamp'} onPress={() => onChangeTab('stamp')} disabled={busy} />
        </View>
        <IconButton label={t.openOriginal} onPress={onOpenOriginal}><AppIcon name="expand" /></IconButton>
      </View>
        <Reanimated.View style={imageStyle}>
          <StampImage source={source} accessibilityLabel={active_tab === 'photo' ? t.photo : t.stamp} resizeMode="contain" style={styles.image} />
          {active_tab === 'stamp' && selected ? <LineArtDisclaimer locale={locale} /> : null}
        </Reanimated.View>
        <SemanticText style={styles.hint}>{t.compareHint}</SemanticText>
        <ResultConfirmation label={t.confirmed} checked={checked} onChange={onConfirmChange} disabled={busy} />
        {blocking_reason ? <Notice message={blocking_reason} tone="warning" /> : !checked ? <SemanticText style={styles.auxiliary}>{t.blocked}</SemanticText> : null}
      </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.sm, gap: theme.spacing.lg },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  tabs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  tab: { flex: 1, minHeight: theme.touchTarget, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radii.round, borderWidth: 1, borderColor: theme.colors.borderControl, backgroundColor: theme.colors.bgSurface, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabCheck: { position: 'absolute', left: theme.spacing.md },
  tabSelected: { borderWidth: 2, borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSubtle },
  tabLabel: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  tabLabelSelected: { color: theme.colors.accent },
  image: { height: 302, backgroundColor: theme.colors.bgPage },
  hint: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
  auxiliary: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
  disabled: { backgroundColor: theme.colors.bgDisabled },
});
