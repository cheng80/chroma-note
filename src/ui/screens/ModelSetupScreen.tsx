import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ModelAssetState } from '../../../modules/chroma-analysis';
import type { DisplayLocale } from '../contract';
import { Button, Notice, Screen } from '../primitives';
import { ProcessingStep } from '../components/ProcessingStep';
import { SemanticText } from '../components/SemanticText';
import { theme } from '../theme';

const copy = {
  ko: {
    header: '시작 준비', title: '사진을 읽을 AI를 준비해요',
    body: '앱을 사용하려면 약 2.95GB의 AI 파일을 한 번 다운로드해 주세요.',
    wifi: '와이파이 연결을 권장해요. 다운로드가 끝날 때까지 앱을 열어 두세요.',
    download: '다운로드', resume: '이어받기', retry: '다시 시도', pause: '일시 정지', pausing: '멈추는 중', starting: '다운로드 준비 중',
    checking: '다운로드한 파일을 확인하고 있어요.', downloading: 'AI 파일을 다운로드하고 있어요.', verifying: '파일이 온전한지 확인하고 있어요.',
    paused: '다운로드를 멈췄어요. 이어받아 준비를 마쳐 주세요.',
    model: '사진 분석 AI', vision: '이미지 처리 파일', active: '진행 중',
    storage: '저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.',
    storageFailed: '파일을 저장하지 못했어요. 다시 시도해 주세요.',
    service: '다운로드 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.',
    network: '다운로드하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    integrity: '파일 확인에 실패했어요. 다시 다운로드해 주세요.',
    unsupported: '이 기기에서는 아직 AI 다운로드를 지원하지 않아요. 현재는 iOS 앱에서 사용할 수 있어요.',
    native: 'AI 다운로드 기능이 포함된 앱으로 업데이트해 주세요.',
    failed: 'AI 준비를 완료하지 못했어요. 다시 시도해 주세요.',
  },
  en: {
    header: 'Get ready', title: 'Prepare AI for your photos',
    body: 'Download about 2.95 GB of AI files once to start using the app.',
    wifi: 'Wi-Fi is recommended. Keep the app open until the download finishes.',
    download: 'Download', resume: 'Resume download', retry: 'Try again', pause: 'Pause', pausing: 'Pausing', starting: 'Preparing download',
    checking: 'Checking downloaded files.', downloading: 'Downloading AI files.', verifying: 'Verifying file integrity.',
    paused: 'Download paused. Resume to finish setup.',
    model: 'Photo analysis AI', vision: 'Image processing file', active: 'In progress',
    storage: 'Not enough storage. Free up space and try again.',
    storageFailed: 'Could not save the files. Please try again.',
    service: 'The download service is unavailable. Please try again later.',
    network: 'Download failed. Check your internet connection and try again.',
    integrity: 'File verification failed. Please download again.',
    unsupported: 'AI downloads are not yet supported on this device. Use the iOS app.',
    native: 'Please update to an app version that includes AI downloads.',
    failed: 'Could not prepare AI. Please try again.',
  },
};

type Props = {
  locale: DisplayLocale;
  state: ModelAssetState;
  pending: 'start' | 'pause' | null;
  start: () => void;
  pause: () => void;
};

export function ModelSetupScreen({ locale, state, pending, start, pause }: Props) {
  const t = copy[locale];
  const code = state.errorCode ?? '';
  const unsupported = /unsupported/.test(code);
  const nativeMissing = /native_build_required|native_unavailable/.test(code);
  const error = unsupported ? t.unsupported : nativeMissing ? t.native
    : /storage_full|out_of_space/.test(code) ? t.storage
    : code === 'model_storage_failed' ? t.storageFailed
    : ['model_catalog_unavailable', 'model_catalog_invalid', 'model_insecure_url', 'model_manifest_invalid'].includes(code) ? t.service
    : /corrupt|hash|checksum|integrity|verification/.test(code) ? t.integrity
    : /network|download|http|timeout|connection/.test(code) ? t.network : t.failed;
  const canStart = ['required', 'paused', 'failed'].includes(state.status) && !unsupported && !nativeMissing;
  const footer = state.status === 'downloading'
    ? <Button label={pending === 'pause' ? t.pausing : t.pause} onPress={pause} busy={pending === 'pause'} tone="secondary" />
    : canStart ? <Button label={pending === 'start' ? t.starting : state.status === 'paused' ? t.resume : state.status === 'failed' ? t.retry : t.download} onPress={start} busy={pending === 'start'} /> : undefined;
  const total = Math.max(0, state.totalBytes);
  const downloaded = Math.max(0, Math.min(state.downloadedBytes, total));
  const progress = total > 0 ? downloaded / total : null;
  const showProgress = ['downloading', 'paused'].includes(state.status) && progress !== null;
  const formatBytes = (bytes: number) => `${(bytes / 1_000_000_000).toFixed(2)} GB`;

  return (
    <Screen title={t.header} footer={footer} contentStyle={styles.content}>
      <SemanticText accessibilityRole="header" style={styles.title}>{t.title}</SemanticText>
      <SemanticText style={styles.body}>{t.body}</SemanticText>
      <Notice message={t.wifi} />
      {state.status === 'failed' ? <Notice message={error} tone="error" /> : null}
      {state.status === 'paused' ? <Notice message={t.paused} /> : null}
      {state.status === 'checking' || state.status === 'verifying' ? <ProcessingStep label={state.status === 'checking' ? t.checking : t.verifying} status="active" statusLabel={t.active} /> : null}
      {state.status === 'downloading' ? <ProcessingStep label={state.currentFile === 'model' ? t.model : state.currentFile === 'vision' ? t.vision : t.downloading} status="active" statusLabel={t.active} /> : null}
      {showProgress ? <View style={styles.progressGroup}>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={t.downloading} accessibilityValue={{ min: 0, max: total, now: downloaded }}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <SemanticText style={styles.detail}>{`${formatBytes(downloaded)} / ${formatBytes(total)} (${Math.floor(progress * 100)}%)`}</SemanticText>
      </View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: theme.spacing.lg, gap: theme.spacing.lg },
  title: { ...theme.typography.title, color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontWeight: '600' },
  body: { ...theme.typography.body, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily },
  detail: { ...theme.typography.secondary, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily },
  progressGroup: { gap: theme.spacing.sm },
  track: { height: 8, borderRadius: theme.radii.round, overflow: 'hidden', backgroundColor: theme.colors.bgSunken },
  fill: { height: '100%', backgroundColor: theme.colors.accent },
});
