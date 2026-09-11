import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, IconButton, Notice } from '../primitives';
import { AppIcon } from '../components/AppIcon';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { OtpScreenProps } from '../contract';

function errorMessage(locale: OtpScreenProps['locale'], code: OtpScreenProps['error_code']) {
  if (!code) return undefined;
  if (code === 'otp_invalid') return locale === 'ko' ? '코드가 맞지 않아요.' : 'That code is not correct.';
  if (code === 'otp_expired') return locale === 'ko' ? '코드가 만료됐어요. 다시 받아 주세요.' : 'The code expired. Get another one.';
  return locale === 'ko' ? '잠시 후 다시 시도해 주세요.' : 'Try again in a moment.';
}

export function OtpScreen({ locale, email, code, status, error_code, resend_seconds, onChangeCode, onVerify, onChangeEmail, onResend }: OtpScreenProps) {
  const copy = getBasicCopy(locale);
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}><IconButton label={copy.back} onPress={onChangeEmail}><AppIcon name="arrow-left" size={20} color={theme.colors.ink} /></IconButton><Text accessibilityRole="header" style={styles.headerTitle}>{copy.otpTitle}</Text></View>
        <Text style={styles.heading}>{copy.otpHeading}</Text>
        <Text style={styles.bodyMuted}>{copy.otpLead(email)}</Text>
        <Field label={copy.otpLabel} value={code} onChangeText={(value) => onChangeCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} error={errorMessage(locale, error_code)} />
        <Button label={copy.otpAction} onPress={onVerify} busy={status === 'pending'} disabled={code.length !== 6} />
        <Button label={copy.changeEmail} onPress={onChangeEmail} tone="secondary" />
        <Button label={resend_seconds > 0 ? (locale === 'ko' ? `${resend_seconds}초 후 다시 받기` : `Get another code in ${resend_seconds}s`) : copy.resend} onPress={onResend} disabled={resend_seconds > 0 || status === 'pending'} tone="secondary" />
        <Notice message={`${copy.mailNoticeTitle}\n${copy.mailNoticeBody}`} tone="info" />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }, header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerTitle: { color: theme.colors.ink, fontSize: 20, lineHeight: 30, fontWeight: '600' }, heading: { color: theme.colors.ink, fontSize: 28, lineHeight: 42, fontWeight: '600' }, bodyMuted: { color: theme.colors.inkSecondary, fontSize: 16, lineHeight: 24 },
});
