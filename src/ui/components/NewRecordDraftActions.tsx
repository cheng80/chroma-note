import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BookScreenProps } from '../contract';
import { Button, IconButton } from '../primitives';
import { theme } from '../theme';
import { AppIcon } from './AppIcon';

type DraftProps = Pick<BookScreenProps, 'locale' | 'drafts' | 'onResumeDraft' | 'onDeleteDraft'>;

export function NewRecordDraftActions({ locale, drafts, onResumeDraft, onDeleteDraft }: DraftProps) {
  const draft = drafts.find(item => item.kind === 'new');
  if (!draft) return null;
  return <View style={styles.actions}>
    <Button style={styles.flex} label={locale === 'ko' ? '새 기록 초안 이어 쓰기' : 'Continue new record draft'} onPress={() => onResumeDraft(draft.draft_id)} tone="subtle" />
    <IconButton label={locale === 'ko' ? '새 기록 초안 삭제' : 'Delete new record draft'} onPress={() => onDeleteDraft(draft.draft_id)}><AppIcon name="trash-2" color={theme.colors.danger} /></IconButton>
  </View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  flex: { flex: 1 },
});
