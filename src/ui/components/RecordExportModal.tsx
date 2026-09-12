import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { DemoRecord, DisplayLocale } from '../contract';
import { demoAssets } from '../demo-assets';
import { exportCaptureSize, toLocalFileUri } from '../export-record';
import { imageSource } from '../record-copy';
import { recordWriting } from '../record-writing';
import { theme } from '../theme';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Notice, type NoticeTone } from './Notice';
import { RecordArtwork } from './RecordArtwork';
import { SemanticText } from './SemanticText';
import { useModalA11y } from './modalA11y';

type ExportStatus =
  | 'ready'
  | 'saving'
  | 'saved'
  | 'permission-denied'
  | 'permission-blocked'
  | 'settings-error'
  | 'capture-error'
  | 'save-error';

const copy = {
  ko: {
    title: '이미지 내보내기',
    close: '이미지 내보내기 닫기',
    intro: '컬러 스케치와 글, 태그를 종이 한 장에 담아 저장해요.',
    preview: '저장할 이미지 미리보기',
    loading: '미리보기를 준비하고 있어요.',
    imageError: '컬러 스케치 이미지를 불러오지 못해 저장할 수 없어요.',
    retryImage: '미리보기 다시 불러오기',
    tooTall: '기록이 이미지 크기 한도를 넘어 저장할 수 없어요.',
    web: '웹에서는 갤러리 저장을 지원하지 않아요. iOS 또는 Android 앱에서 이용해 주세요.',
    save: '갤러리에 저장',
    saving: '갤러리에 저장 중…',
    retry: '다시 시도',
    cancel: '취소',
    done: '완료',
    saved: '갤러리에 저장했어요.',
    permissionDenied: '사진 추가 권한이 없어 저장하지 않았어요. 권한을 허용한 뒤 다시 시도해 주세요.',
    permissionBlocked: '사진 추가 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.',
    settings: '설정 열기',
    settingsError: '설정을 열지 못했어요. 기기 설정에서 Chroma Note의 사진 추가 권한을 허용해 주세요.',
    captureError: '이미지를 만들지 못했어요. 미리보기를 확인한 뒤 다시 시도해 주세요.',
    saveError: '갤러리에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    title: 'Export image',
    close: 'Close image export',
    intro: 'Save the color sketch, writing, and tags together on one paper image.',
    preview: 'Image preview',
    loading: 'Preparing the preview.',
    imageError: 'The color sketch image could not load, so it cannot be saved.',
    retryImage: 'Reload preview',
    tooTall: 'This record exceeds the image size limit and cannot be saved.',
    web: 'Saving to the gallery is not supported on the web. Use the iOS or Android app.',
    save: 'Save to gallery',
    saving: 'Saving to gallery…',
    retry: 'Try again',
    cancel: 'Cancel',
    done: 'Done',
    saved: 'Saved to your gallery.',
    permissionDenied: 'Nothing was saved because photo add access was not granted. Allow access and try again.',
    permissionBlocked: 'Photo add access is off. Allow it in Settings, then try again.',
    settings: 'Open Settings',
    settingsError: 'Settings could not be opened. Allow Chroma Note to add photos in device settings.',
    captureError: 'The image could not be created. Check the preview and try again.',
    saveError: 'The image could not be saved to your gallery. Try again shortly.',
  },
} as const;

function statusNotice(status: ExportStatus, locale: DisplayLocale): { message: string; tone: NoticeTone } | null {
  const text = copy[locale];
  switch (status) {
    case 'saved': return { message: text.saved, tone: 'success' };
    case 'permission-denied': return { message: text.permissionDenied, tone: 'warning' };
    case 'permission-blocked': return { message: text.permissionBlocked, tone: 'warning' };
    case 'settings-error': return { message: text.settingsError, tone: 'error' };
    case 'capture-error': return { message: text.captureError, tone: 'error' };
    case 'save-error': return { message: text.saveError, tone: 'error' };
    default: return null;
  }
}

export function RecordExportModal({ record, locale, onClose, restoreFocusRef }: { record: DemoRecord; locale: DisplayLocale; onClose: () => void; restoreFocusRef?: React.RefObject<unknown | null> }) {
  const text = copy[locale];
  const closeRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const { dialogRef: modalRef, onShow } = useModalA11y({ visible: true, initialFocusRef: closeRef, restoreFocusRef });
  const artworkRef = useRef<View>(null);
  const savingRef = useRef(false);
  const [status, setStatus] = useState<ExportStatus>('ready');
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [imageAttempt, setImageAttempt] = useState(0);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [textReady, setTextReady] = useState<Record<string, boolean>>({});
  const handleTextSettled = useCallback((field: string, ready: boolean) => {
    setTextReady(previous => previous[field] === ready ? previous : { ...previous, [field]: ready });
  }, []);
  const writingReady = (!record.fields.place_name || textReady.place)
    && (!recordWriting(record.fields) || textReady.note);
  const source = useMemo(() => imageSource(record.stamp.local_uri, demoAssets.stamp.source, record.stamp.image_headers), [record.stamp.local_uri, record.stamp.image_headers]);
  const captureSize = exportCaptureSize(layout.width, layout.height, PixelRatio.get());
  const notice = statusNotice(status, locale);
  const busy = status === 'saving';
  const supported = Platform.OS === 'ios' || Platform.OS === 'android';
  const canSave = supported && imageState === 'loaded' && writingReady && captureSize.kind === 'ready' && !busy && status !== 'saved';
  const currentCapture = useRef({ captureSize, ready: imageState === 'loaded' && writingReady });
  useLayoutEffect(() => {
    currentCapture.current = { captureSize, ready: imageState === 'loaded' && writingReady };
  }, [captureSize, imageState, writingReady]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  const retryImage = () => {
    setStatus('ready');
    setImageState('loading');
    setLayout({ width: 0, height: 0 });
    setTextReady({});
    setImageAttempt((value) => value + 1);
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
      setStatus('permission-blocked');
    } catch {
      setStatus('settings-error');
    }
  };

  const save = async () => {
    if (savingRef.current || !canSave || captureSize.kind !== 'ready') return;
    savingRef.current = true;
    setStatus('saving');
    let captureUri: string | null = null;
    let releaseCapture: ((uri: string) => void) | null = null;
    let stage: 'permission' | 'capture' | 'save' = 'permission';

    try {
      const mediaLibrary = await import('expo-media-library');
      let permission = await mediaLibrary.getPermissionsAsync(true, []);
      if (!permission.granted && permission.canAskAgain) permission = await mediaLibrary.requestPermissionsAsync(true, []);
      if (!permission.granted) {
        setStatus(permission.canAskAgain ? 'permission-denied' : 'permission-blocked');
        return;
      }

      stage = 'capture';
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const viewShot = await import('react-native-view-shot');
      const current = currentCapture.current;
      if (!current.ready || current.captureSize.kind !== 'ready') {
        setStatus('ready');
        return;
      }
      releaseCapture = viewShot.releaseCapture;
      captureUri = await viewShot.captureRef(artworkRef, {
        format: 'png',
        result: 'tmpfile',
        width: current.captureSize.width,
        height: current.captureSize.height,
      });
      if (!captureUri) throw new Error('empty capture URI');

      stage = 'save';
      const asset = await mediaLibrary.Asset.create(toLocalFileUri(captureUri));
      if (!asset.id) throw new Error('media asset was not created');
      setStatus('saved');
    } catch {
      setStatus(stage === 'capture' ? 'capture-error' : 'save-error');
    } finally {
      if (captureUri && releaseCapture) {
        try { releaseCapture(captureUri); } catch { /* temporary files are also cleared when the app exits */ }
      }
      savingRef.current = false;
    }
  };

  const retrying = status === 'permission-denied' || status === 'permission-blocked' || status === 'settings-error' || status === 'capture-error' || status === 'save-error';

  return (
    <Modal animationType="none" onRequestClose={busy ? undefined : onClose} onShow={onShow} presentationStyle="fullScreen">
      <SafeAreaProvider style={styles.modalRoot}>
      <SafeAreaView ref={modalRef} accessibilityViewIsModal={Platform.OS !== 'web'} edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
        <View style={styles.header}>
          <SemanticText accessibilityRole="header" style={styles.title}>{text.title}</SemanticText>
          <IconButton ref={closeRef} label={text.close} onPress={onClose} disabled={busy} icon="x" />
        </View>
        <ScrollView removeClippedSubviews={false} contentContainerStyle={styles.content} bounces={false} showsVerticalScrollIndicator={false}>
          <SemanticText style={styles.intro}>{text.intro}</SemanticText>
          {!supported ? <Notice message={text.web} tone="info" /> : null}
          {imageState === 'loading' || (imageState === 'loaded' && !writingReady) ? <Notice message={text.loading} tone="info" busy /> : null}
          {imageState === 'error' ? <Notice message={text.imageError} tone="error" /> : null}
          {captureSize.kind === 'too-tall' ? <Notice message={text.tooTall} tone="error" /> : null}
          {notice ? <Notice message={notice.message} tone={notice.tone} /> : null}
          <SemanticText style={styles.previewLabel}>{text.preview}</SemanticText>
          <View style={styles.previewFrame}>
            <View key={imageAttempt} ref={artworkRef} collapsable={false} onLayout={handleLayout} style={styles.captureSurface}>
              <RecordArtwork
                fields={record.fields}
                source={source}
                locale={locale}
                aspectRatio={record.stamp.width / record.stamp.height}
                exportMode
                onTextSettled={handleTextSettled}
                onImageLoad={() => setImageState('loaded')}
                onImageError={() => setImageState('error')}
              />
            </View>
          </View>
          {imageState === 'error' ? <Button label={text.retryImage} onPress={retryImage} tone="secondary" /> : null}
          {status === 'permission-blocked' || status === 'settings-error' ? <Button label={text.settings} onPress={openSettings} tone="secondary" /> : null}
        </ScrollView>
        <View style={styles.footer}>
          {status === 'saved' ? <Button label={text.done} onPress={onClose} /> : (
            <>
              <Button label={busy ? text.saving : retrying ? text.retry : text.save} onPress={save} busy={busy} disabled={!canSave && !busy} />
              <Button label={text.cancel} onPress={onClose} disabled={busy} tone="secondary" />
            </>
          )}
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  page: { flex: 1, backgroundColor: theme.colors.bgSurface },
  header: { width: '100%', maxWidth: theme.contentMaxWidth, alignSelf: 'center', minHeight: 72, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  title: { flex: 1, color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.heading.fontSize, lineHeight: theme.typography.heading.lineHeight, fontWeight: '600' },
  content: { width: '100%', maxWidth: theme.contentMaxWidth, alignSelf: 'center', paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xl, gap: theme.spacing.md },
  intro: { color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.body.fontSize, lineHeight: theme.typography.body.lineHeight },
  previewLabel: { color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.secondary.fontSize, lineHeight: theme.typography.secondary.lineHeight, fontWeight: '600' },
  previewFrame: { width: '100%', maxWidth: 540, alignSelf: 'center', borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.bgPage, overflow: 'hidden' },
  captureSurface: { width: '100%', backgroundColor: theme.colors.bgPage },
  footer: { width: '100%', maxWidth: theme.contentMaxWidth, alignSelf: 'center', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, gap: theme.spacing.sm },
});
