import React from 'react';
import { ImageSourcePropType, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Notice, StampImage } from '../primitives';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { EmailScreenProps } from '../contract';
import { SemanticText } from '../components/SemanticText';

const designStamp = require('../../../design/images/lineart-style1-source-rgb.png') as ImageSourcePropType;

function errorMessage(locale: EmailScreenProps['locale'], code: EmailScreenProps['error_code']) {
  if (!code) return undefined;
  if (code === 'offline') return locale === 'ko' ? '연결을 확인하고 다시 시도해 주세요.' : 'Check your connection and try again.';
  if (code === 'email_invalid') return locale === 'ko' ? '이메일 주소를 확인해 주세요.' : 'Check your email address.';
  if (code === 'send_failed') return locale === 'ko' ? '코드를 보내지 못했어요.' : 'The code could not be sent.';
  return locale === 'ko' ? '잠시 후 다시 시도해 주세요.' : 'Try again in a moment.';
}

type Props = EmailScreenProps & {
  restoreStatus?: 'restoring' | 'failed';
  onRetryRestore?: () => void;
  onStartSessionReauthentication?: () => void;
};

export function EmailScreen({ locale, email, status, error_code, restoreStatus, onRetryRestore, onStartSessionReauthentication, onChangeEmail, onSubmit }: Props) {
  const copy = getBasicCopy(locale);
  const restoring = restoreStatus === 'restoring';
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
        <SemanticText accessibilityRole="header" style={styles.brand}>{copy.brand}</SemanticText>
        <StampImage source={designStamp} accessibilityLabel={locale === 'ko' ? '기록 예시 이미지' : 'Record example image'} style={styles.heroImage} />
        {restoreStatus ? <>
          <SemanticText accessibilityRole="header" style={styles.heading}>{locale === 'ko' ? restoring ? '세션을 확인하고 있어요' : '세션을 확인하지 못했어요' : restoring ? 'Checking your session' : 'Could not check your session'}</SemanticText>
          <Notice tone={restoring ? 'info' : 'warning'} busy={restoring} message={locale === 'ko' ? restoring ? '계정을 확인한 뒤 이 기기에 보관한 작업을 불러옵니다.' : '연결을 확인하고 다시 시도해 주세요. 이 기기에 보관한 작업은 그대로 유지됩니다.' : restoring ? 'Your work kept on this device will load after your account is confirmed.' : 'Check your connection and try again. Work kept on this device remains unchanged.'} />
          {!restoring && onRetryRestore ? <Button label={locale === 'ko' ? '세션 복원 다시 시도' : 'Retry session restore'} onPress={onRetryRestore} /> : null}
          {!restoring && onStartSessionReauthentication ? <Button label={locale === 'ko' ? '이메일로 다시 인증' : 'Reauthenticate with email'} onPress={onStartSessionReauthentication} tone="secondary" /> : null}
        </> : <>
          <SemanticText accessibilityRole="header" style={styles.heading}>{copy.authTitle}</SemanticText>
          <SemanticText style={styles.bodyMuted}>{copy.authLead}</SemanticText>
          <Field label={copy.emailLabel} value={email} onChangeText={onChangeEmail} placeholder={copy.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" hint={locale === 'ko' ? '처음이라면 새 계정이 만들어져요.' : 'A new account is created if this is your first visit.'} error={errorMessage(locale, error_code)} />
          <Button label={copy.emailAction} onPress={onSubmit} busy={status === 'pending'} disabled={!email.trim()} />
          <SemanticText style={styles.caption}>{copy.authEmailHint}</SemanticText>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { width: '100%', maxWidth: theme.contentMaxWidth, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 },
  brand: { color: theme.colors.ink, fontFamily: theme.typography.displayFamily, fontSize: 20, lineHeight: 30 }, heroImage: { height: 200, minHeight: 0, marginTop: 0 }, heading: { color: theme.colors.ink, fontSize: 28, lineHeight: 38, fontWeight: '600' }, bodyMuted: { color: theme.colors.inkSecondary, fontSize: 16, lineHeight: 24 }, caption: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
});
