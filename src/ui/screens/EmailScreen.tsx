import React from 'react';
import { ImageSourcePropType, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, StampImage } from '../primitives';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { EmailScreenProps } from '../contract';
import { SemanticText } from '../components/SemanticText';

const designStamp = require('../../../design/images/generated-1788887279815.png') as ImageSourcePropType;

function errorMessage(locale: EmailScreenProps['locale'], code: EmailScreenProps['error_code']) {
  if (!code) return undefined;
  if (code === 'email_invalid') return locale === 'ko' ? '이메일 주소를 확인해 주세요.' : 'Check your email address.';
  if (code === 'send_failed') return locale === 'ko' ? '코드를 보내지 못했어요.' : 'The code could not be sent.';
  return locale === 'ko' ? '잠시 후 다시 시도해 주세요.' : 'Try again in a moment.';
}

export function EmailScreen({ locale, email, status, error_code, onChangeEmail, onSubmit }: EmailScreenProps) {
  const copy = getBasicCopy(locale);
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.brand}>{copy.brand}</Text>
        <StampImage source={designStamp} accessibilityLabel={locale === 'ko' ? '기록 예시 이미지' : 'Record example image'} style={styles.heroImage} />
        <SemanticText accessibilityRole="header" style={styles.heading}>{copy.authTitle}</SemanticText>
        <SemanticText style={styles.bodyMuted}>{copy.authLead}</SemanticText>
        <Field label={copy.emailLabel} value={email} onChangeText={onChangeEmail} placeholder={copy.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errorMessage(locale, error_code)} />
        <Button label={copy.emailAction} onPress={onSubmit} busy={status === 'pending'} disabled={!email.trim()} />
        <SemanticText style={styles.caption}>{copy.authEmailHint}</SemanticText>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 },
  brand: { color: theme.colors.ink, fontFamily: theme.typography.displayFamily, fontSize: 20, lineHeight: 30 }, heroImage: { height: 200, minHeight: 0, marginTop: 0 }, heading: { color: theme.colors.ink, fontSize: 28, lineHeight: 38, fontWeight: '600' }, bodyMuted: { color: theme.colors.inkSecondary, fontSize: 16, lineHeight: 24 }, caption: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
});
