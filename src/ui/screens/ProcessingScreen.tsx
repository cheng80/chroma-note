import React from 'react';
import { StyleSheet } from 'react-native';
import { SemanticText } from '../components/SemanticText';

import type { ProcessStep, ProcessingScreenProps } from '../contract';
import { ProcessingStep, type ProcessingStepStatus } from '../components/ProcessingStep';
import { Button, Notice, Screen, StampImage } from '../primitives';
import { imageSource, recordCopy } from '../record-copy';
import { theme } from '../theme';

const steps: ProcessStep[] = ['prepare', 'colors', 'analysis', 'stamp'];

export function ProcessingScreen({ locale, images, draft, active_job, model_status, onCancel, onRetry, onSkipAnalysis, onChangePhoto, replacePhotoTriggerRef }: ProcessingScreenProps) {
  const t = recordCopy[locale];
  const failed = active_job?.status === 'failed' || Boolean(draft.error_code);
  const analysisFailed = failed && (active_job?.step === 'prepare' || active_job?.step === 'analysis');
  const error = draft.error_code && draft.error_code in t.modelErrors
    ? t.modelErrors[draft.error_code as keyof typeof t.modelErrors]
    : t.error;
  const preparing = active_job?.step === 'prepare' && model_status === 'preparing' && !failed;
  const activeIndex = active_job ? steps.indexOf(active_job.step) : -1;
  const source = imageSource(draft.photo.local_uri, images.photo);
  const statusFor = (step: ProcessStep, index: number): ProcessingStepStatus => {
    if (failed && active_job?.step === step) return 'error';
    if (index < activeIndex || !active_job) return 'done';
    if (index === activeIndex) return 'active';
    return 'waiting';
  };
  const footer = failed ? <><Button label={t.retry} onPress={onRetry} />{analysisFailed ? <Button label={t.skip} onPress={onSkipAnalysis} tone="secondary" /> : null}<Button ref={replacePhotoTriggerRef} label={t.changePhoto} onPress={onChangePhoto} tone="secondary" /><Button label={t.stop} onPress={onCancel} tone="subtle" /></> : <Button label={t.stop} onPress={onCancel} tone="subtle" />;

  return (
    <Screen title={preparing ? t.preparingHeader : t.processingHeader} onBack={onCancel} backLabel={t.back} footer={footer} contentStyle={styles.content}>
      {failed ? <Notice message={error} tone="error" /> : null}
      <StampImage source={source} accessibilityLabel={locale === 'ko' ? '처리 중인 원본 사진' : 'Photo being processed'} resizeMode="contain" style={styles.photo} />
      {!failed ? <><SemanticText accessibilityRole="header" style={styles.title}>{preparing ? t.preparingTitle : t.processingTitle}</SemanticText>
        <SemanticText style={styles.body}>{preparing ? t.preparingBody : t.processingBody}</SemanticText></> : null}
      {preparing ? <ProcessingStep label={t.preparingNotice} status="active" statusLabel={t.stepStatus.active} /> : <>{steps.map((step, index) => { const status = statusFor(step, index); return <ProcessingStep key={step} label={t.steps[step]} status={status} statusLabel={t.stepStatus[status]} />; })}</>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.sm, gap: theme.spacing.lg },
  photo: { height: 230, backgroundColor: theme.colors.bgPage },
  title: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 28, lineHeight: 42, fontWeight: '600' },
  body: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 14, lineHeight: 21 },
});
