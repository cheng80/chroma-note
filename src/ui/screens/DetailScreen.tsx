import React, { useRef, useState } from 'react';
import { ImageSourcePropType, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export function DetailScreen({ locale, images: _images, record, sheet, image_missing, status_message, onBack, onOpenRead: _onOpenRead, onOpenActions, onRequestCloseSheet, onEdit, onRequestDelete, onToggleFavorite, onRetryImage }: DetailScreenProps) {
  const copy = getBasicCopy(locale);
  const [imageOpen, setImageOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const pendingExport = useRef(false);
  const openExport = () => {
    pendingExport.current = Platform.OS === 'ios';
    onRequestCloseSheet();
    if (Platform.OS !== 'ios') setExportOpen(true);
  };
  const afterActionsDismiss = () => {
    if (pendingExport.current) { pendingExport.current = false; setExportOpen(true); }
  };
  const imageButtonRef = useRef<View>(null);
  const viewerRef = useModalA11y({ visible: imageOpen, restoreFocusRef: imageButtonRef });
  const imageSource = sourceFor(record.stamp.local_uri, designStamp);
  const imageLabel = locale === 'ko' ? '기록의 스탬프 이미지' : 'Record stamp image';
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><IconButton label={copy.back} onPress={onBack}><AppIcon name="arrow-left" size={20} color={theme.colors.ink} /></IconButton><Text accessibilityRole="header" style={styles.headerTitle}>{copy.record}</Text><IconButton label={copy.actions} onPress={onOpenActions}><AppIcon name="ellipsis" size={20} color={theme.colors.ink} /></IconButton></View>
        {status_message ? <Notice message={copy.saved} tone="success" /> : null}
        {image_missing ? <><Notice message={copy.imageMissing} tone="error" /><Button label={copy.retryImage} onPress={onRetryImage} tone="secondary" /></> : <RecordArtwork fields={record.fields} source={imageSource} locale={locale} imageButtonRef={imageButtonRef} onImagePress={() => setImageOpen(true)} />}
        <View style={styles.favorite}><IconButton label={record.fields.is_favorite ? copy.favoriteOn : copy.favorite} onPress={onToggleFavorite}><AppIcon name="heart" size={20} color={record.fields.is_favorite ? theme.colors.danger : theme.colors.ink} fill={record.fields.is_favorite ? theme.colors.danger : 'none'} /></IconButton><Text style={styles.body}>{copy.favorite}</Text></View>
      </ScrollView>
      <View style={styles.footer}><Button label={copy.edit} onPress={onEdit} /></View>
      {sheet?.kind === 'read' ? <ReadSheet locale={locale} record={record} onClose={onRequestCloseSheet} /> : null}
      <RecordActionsSheet locale={locale} visible={sheet?.kind === 'actions'} onDismiss={afterActionsDismiss} onExport={openExport} onClose={onRequestCloseSheet} onEdit={onEdit} onDelete={onRequestDelete} />
      {exportOpen ? <RecordExportModal record={record} locale={locale} onClose={() => setExportOpen(false)} /> : null}
      {imageOpen ? <Modal animationType="none" onRequestClose={() => setImageOpen(false)} presentationStyle="fullScreen"><SafeAreaView ref={viewerRef} accessibilityViewIsModal edges={['top', 'right', 'bottom', 'left']} style={styles.viewer}><View style={styles.viewerHeader}><Text accessibilityRole="header" style={styles.headerTitle}>{locale === 'ko' ? '스탬프 이미지' : 'Stamp image'}</Text><IconButton label={copy.close} onPress={() => setImageOpen(false)}><AppIcon name="x" size={20} color={theme.colors.ink} /></IconButton></View><ZoomableImage locale={locale} source={imageSource} accessibilityLabel={imageLabel} /></SafeAreaView></Modal> : null}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: theme.colors.bgPage }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 16 }, header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerTitle: { flex: 1, color: theme.colors.ink, fontSize: 20, lineHeight: 30, fontWeight: '600' }, body: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, favorite: { flexDirection: 'row', alignItems: 'center', gap: 12 }, footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }, viewer: { flex: 1, paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, backgroundColor: theme.colors.bgPage }, viewerHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
});
