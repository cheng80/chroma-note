import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SaveAttempt } from '../../domain/record';
import type { DisplayLocale } from '../contract';
import { theme } from '../theme';
import { Notice } from './Notice';

type Snapshot = Pick<SaveAttempt, 'owner_id' | 'operation_id' | 'state'>;

export function SaveFeedback({ ownerId, attempt, locale }: { ownerId: string | null; attempt: SaveAttempt | null; locale: DisplayLocale }) {
  const insets = useSafeAreaInsets();
  const previous = useRef<Snapshot | null>(null);
  const [notice, setNotice] = useState<Snapshot | null>(null);
  const attemptOwner = attempt?.owner_id;
  const operationId = attempt?.operation_id;
  const state = attempt?.state;

  useEffect(() => {
    const current = ownerId && attemptOwner === ownerId && operationId && state
      ? { owner_id: ownerId, operation_id: operationId, state } : null;
    const prior = previous.current;
    previous.current = current;
    setNotice(current?.state === 'saved' && prior && prior.state !== 'saved'
      && prior.owner_id === current.owner_id && prior.operation_id === current.operation_id ? current : null);
  }, [attemptOwner, operationId, ownerId, state]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice || notice.owner_id !== ownerId || notice.owner_id !== attemptOwner || notice.operation_id !== operationId || state !== 'saved') return null;
  return <View pointerEvents="none" style={[styles.overlay, { top: insets.top + theme.spacing.sm, left: insets.left + theme.spacing.lg, right: insets.right + theme.spacing.lg }]}>
    <Notice tone="success" style={styles.notice} message={locale === 'ko' ? '기록을 저장했어요.' : 'Your record has been saved.'} />
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', zIndex: 100 },
  notice: { width: '100%', maxWidth: theme.contentMaxWidth, alignSelf: 'center' },
});
