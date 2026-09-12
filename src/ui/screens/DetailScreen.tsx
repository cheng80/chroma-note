import { SemanticText } from '../components/SemanticText';
import React, { useRef, useState } from 'react';
import { ImageSourcePropType, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, Notice } from '../primitives';
import { RecordExportModal } from '../components/RecordExportModal';
import { RecordArtwork } from '../components/RecordArtwork';
import { imageSource as sourceFor } from '../record-copy';
import { AppIcon } from '../components/AppIcon';
import { useModalA11y } from '../components/modalA11y';
import { ZoomableImage } from '../components/ZoomableImage';
import { ReadSheet } from '../sheets/ReadSheet';
import { RecordActionsSheet } from '../sheets/RecordActionsSheet';
import { getBasicCopy } from '../basic-copy';
import { theme } from '../theme';
import type { DetailScreenProps } from '../contract';

const designStamp = require('../../../design/images/generated-1788887279815.png') as ImageSourcePropType;

export function DetailScreen({ locale, images: _images, record, sheet, image_missing, onBack, onOpenRead: _onOpenRead, onOpenActions, onRequestCloseSheet, onEdit, onRequestDelete, onToggleFavorite, onRetryImage, actionsTriggerRef }: DetailScreenProps) {
  const copy = getBasicCopy(locale);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const pendingExport = useRef(false);
  const openExport = () => {
    if (imageFailed) return;
    pendingExport.current = Platform.OS === 'ios';
    onRequestCloseSheet();
    if (Platform.OS !== 'ios') setExportOpen(true);
  };
  const afterActionsDismiss = () => {
    if (pendingExport.current) { pendingExport.current = false; setExportOpen(true); }
  };
  const imageButtonRef = useRef<View>(null);
  const viewerCloseRef = useRef<View>(null);
  const { dialogRef: viewerRef, onShow: onViewerShow } = useModalA11y({ visible: imageOpen, initialFocusRef: viewerCloseRef, restoreFocusRef: imageButtonRef });
  const imageSource = sourceFor(record.stamp.local_uri, designStamp, record.stamp.image_headers);
  const imageLabel = locale === 'ko' ? '기록의 컬러 스케치 이미지' : 'Record color sketch image';
  const imageFailed = image_missing || !record.stamp.local_uri || failedImageUri === record.stamp.local_uri;
  const retryImage = () => {
    setFailedImageUri(null);
    setImageAttempt((attempt) => attempt + 1);
    onRetryImage();
  };
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><IconButton label={copy.back} onPress={onBack}><AppIcon name="arrow-left" size={20} color={theme.colors.ink} /></IconButton><SemanticText accessibilityRole="header" style={styles.headerTitle}>{copy.record}</SemanticText><IconButton ref={actionsTriggerRef} label={copy.actions} onPress={onOpenActions}><AppIcon name="ellipsis" size={20} color={theme.colors.ink} /></IconButton></View>
        {imageFailed ? <><Notice message={copy.imageMissing} tone="error" /><Button label={copy.retryImage} onPress={retryImage} tone="secondary" /></> : null}<RecordArtwork imageMissing={imageFailed} key={imageAttempt} fields={record.fields} source={imageSource} locale={locale} aspectRatio={record.stamp.width / record.stamp.height} imageButtonRef={imageButtonRef} onImagePress={imageFailed ? undefined : () => setImageOpen(true)} onImageError={() => setFailedImageUri(record.stamp.local_uri)} />
        <View style={styles.favorite}><IconButton label={record.fields.is_favorite ? copy.favoriteOn : copy.favorite} onPress={onToggleFavorite}><AppIcon name="heart" size={20} color={record.fields.is_favorite ? theme.colors.danger : theme.colors.ink} fill={record.fields.is_favorite ? theme.colors.danger : 'none'} /></IconButton><SemanticText style={styles.body}>{copy.favorite}</SemanticText></View>
      </ScrollView>
      {sheet?.kind === 'read' ? <ReadSheet locale={locale} record={record} onClose={onRequestCloseSheet} restoreFocusRef={actionsTriggerRef} /> : null}
      <RecordActionsSheet restoreFocusRef={actionsTriggerRef} exportDisabled={imageFailed} locale={locale} visible={sheet?.kind === 'actions'} onDismiss={afterActionsDismiss} onExport={openExport} onClose={onRequestCloseSheet} onEdit={onEdit} onDelete={onRequestDelete} />
      {exportOpen ? <RecordExportModal record={record} locale={locale} restoreFocusRef={actionsTriggerRef} onClose={() => setExportOpen(false)} /> : null}
      {imageOpen ? <Modal animationType="none" onRequestClose={() => setImageOpen(false)} onShow={onViewerShow} presentationStyle="fullScreen"><SafeAreaProvider style={styles.modalRoot}><SafeAreaView ref={viewerRef} accessibilityViewIsModal edges={['top', 'right', 'bottom', 'left']} style={styles.viewer}><View style={styles.viewerHeader}><SemanticText accessibilityRole="header" style={styles.headerTitle}>{locale === 'ko' ? '컬러 스케치 이미지' : 'Color sketch image'}</SemanticText><IconButton ref={viewerCloseRef} label={copy.close} onPress={() => setImageOpen(false)}><AppIcon name="x" size={20} color={theme.colors.ink} /></IconButton></View><ZoomableImage showConversionNotice locale={locale} source={imageSource} accessibilityLabel={imageLabel} /></SafeAreaView></SafeAreaProvider></Modal> : null}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, modalRoot: { flex: 1 }, page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { width: '100%', maxWidth: theme.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 16 }, header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerTitle: { flex: 1, color: theme.colors.ink, fontSize: 20, lineHeight: 30, fontWeight: '600' }, body: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, favorite: { flexDirection: 'row', alignItems: 'center', gap: 12 }, viewer: { flex: 1, paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, backgroundColor: theme.colors.bgPage }, viewerHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
});
