import React, { useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { BookScreen, DetailScreen, EmailScreen, OtpScreen, SettingsScreen } from './basic-screens';
import { CompareScreen, ImageViewerScreen, PhotoInputScreen, ProcessingScreen, RecordSummaryScreen } from './record-flow';
import { DemoDialogs } from './DemoDialogs';
import { useAppController } from './useAppController';
import type { DemoAction } from './demo-state';
import type { DemoScenario, SheetChange } from './contract';
import { imageSource } from './record-copy';
import { ModelSetupGate } from './ModelSetupGate';

export default function AppDemo() {
  return <ModelSetupGate><AppContent /></ModelSetupGate>;
}

function AppContent() {
  const dialogTriggerRef = useRef<View>(null);
  const { fontScale } = useWindowDimensions();
  const { state, send, images, assets, visibleRecords, draft, record, hasMore, refreshing, resendSeconds, pendingDeletions, canSaveBeforeLogout, sessionRestoreStatus, retrySessionRestore, beginSessionReauthentication } = useAppController();
  const selectedCandidate = draft?.selected_candidate;
  const viewingStamp = state.comparison_tab === 'stamp' && Boolean(selectedCandidate);
  const viewerSource = viewingStamp && selectedCandidate
    ? imageSource(selectedCandidate.local_uri, images.stamp, selectedCandidate.image_headers)
    : draft ? imageSource(draft.photo.local_uri, images.photo) : images.photo;
  const viewerAspectRatio = viewingStamp && selectedCandidate
    ? selectedCandidate.width / selectedCandidate.height
    : draft ? draft.photo.width / draft.photo.height : assets.photo.aspect_ratio;
  const confirmed = Boolean(selectedCandidate && selectedCandidate.input_revision === draft?.input_revision && draft.confirmation?.candidate_id === selectedCandidate.candidate_id && draft.confirmation.input_revision === draft.input_revision);
  const blockingReason = draft && (!selectedCandidate || !confirmed || !draft.fields.diary_date || draft.stage !== 'summary')
    ? state.locale === 'ko' ? '내용 확인을 마친 뒤 저장할 수 있어요.' : 'Confirm the result before saving.' : null;
  const summaryProps = draft ? {
    discardSaveTriggerRef: dialogTriggerRef, locale: state.locale, images, draft, sheet: state.sheet, save_attempt: state.save_attempt, blocking_reason: blockingReason,
    onBack: () => send({ type: 'summary-back' }), onClose: () => send({ type: 'cancel-record' }),
    onOpenSheet: (kind: 'datePlace' | 'analysis' | 'colors') => send({ type: 'open-summary-sheet', kind }), onChangeSheet: (change: SheetChange) => send({ type: 'sheet-change', change } as DemoAction),
    onApplySheet: () => send({ type: 'sheet-apply' }), onCancelSheet: () => send({ type: 'sheet-cancel' }), onRequestCloseSheet: () => send({ type: 'sheet-close' }), onRequestCaption: () => send({ type: 'request-caption' }),
    onSave: () => send({ type: 'save' }), onRetrySave: () => send({ type: 'retry-save' }), onDiscardSave: () => send({ type: 'request-discard-save' }),
  } : null;

  let content: React.ReactNode = null;
  if (sessionRestoreStatus !== 'complete') content = <EmailScreen locale={state.locale} images={images} email={state.email} status={state.auth.status} error_code={state.auth.error_code} restoreStatus={sessionRestoreStatus} onRetryRestore={retrySessionRestore} onStartSessionReauthentication={beginSessionReauthentication} onChangeEmail={(email) => send({ type: 'email', value: email })} onSubmit={() => send({ type: 'submit-email' })} />;
  else if (state.route === 'email') content = <EmailScreen locale={state.locale} images={images} email={state.email} status={state.auth.status} error_code={state.auth.error_code} onChangeEmail={(email) => send({ type: 'email', value: email })} onSubmit={() => send({ type: 'submit-email' })} />;
  else if (state.route === 'otp') content = <OtpScreen locale={state.locale} email={state.email} code={state.code} status={state.auth.status} error_code={state.auth.error_code} resend_seconds={resendSeconds} onChangeCode={(code) => send({ type: 'code', value: code })} onVerify={() => send({ type: 'verify' })} onChangeEmail={() => send({ type: 'back-email' })} onResend={() => send({ type: 'resend' })} />;
  else if (state.route === 'book' && state.session) content = <BookScreen importTriggerRef={dialogTriggerRef} locale={state.locale} session={state.session} images={images} records={visibleRecords} drafts={Object.values(state.drafts).filter((item): item is NonNullable<typeof item> => Boolean(item))} filter={state.book_filter} list_state={state.book_state} pending_deletions={pendingDeletions} model_status={state.model_status} save_attempt={state.save_attempt} sheet={state.sheet} has_more={hasMore} refreshing={refreshing} onOpenSettings={() => send({ type: 'open-settings' })} onStartRecord={() => send({ type: 'start-record' })} onResumeDraft={(draftId) => send({ type: 'resume-draft', draftId })} onDeleteDraft={(draftId) => send({ type: 'request-delete-draft', draftId })} onOpenRecord={(recordId) => send({ type: 'open-detail', recordId })} onToggleFavorite={(recordId) => send({ type: 'toggle-favorite', recordId })} onOpenFilter={() => send({ type: 'open-filter' })} onChangeSheet={(change) => send({ type: 'sheet-change', change } as DemoAction)} onApplySheet={() => send({ type: 'sheet-apply' })} onCancelSheet={() => send({ type: 'sheet-cancel' })} onRequestCloseSheet={() => send({ type: 'sheet-close' })} onLoadMore={() => send({ type: 'load-more' })} onRetry={() => send({ type: 'retry-book' })} />;
  else if (state.route === 'photo' && state.session) content = <PhotoInputScreen replacePhotoTriggerRef={dialogTriggerRef} locale={state.locale} images={images} draft={state.drafts.new} onUseDemoPhoto={() => send({ type: 'use-photo' })} onContinue={() => send({ type: 'continue-photo' })} onCancel={() => send({ type: 'cancel-record' })} onRequestReplace={() => send({ type: 'replace-photo' })} />;
  else if (state.route === 'processing' && state.session && state.drafts.new) content = <ProcessingScreen replacePhotoTriggerRef={dialogTriggerRef} locale={state.locale} images={images} draft={state.drafts.new} active_job={state.active_job} model_status={state.model_status} onCancel={() => send({ type: 'cancel-record' })} onRetry={() => send({ type: 'retry-processing' })} onSkipAnalysis={() => send({ type: 'skip-analysis' })} onChangePhoto={() => send({ type: 'replace-photo' })} />;
  else if (state.route === 'compare' && state.session && state.drafts.new) content = <CompareScreen replacePhotoTriggerRef={dialogTriggerRef} locale={state.locale} images={images} draft={state.drafts.new} active_tab={state.comparison_tab} busy={Boolean(state.active_job)} blocking_reason={null} onBack={() => send({ type: 'cancel-record' })} onChangeTab={(value: 'photo' | 'stamp') => send({ type: 'compare-tab', value })} onOpenOriginal={() => send({ type: 'open-original' })} onConfirmChange={(value: boolean) => send({ type: 'confirm', value })} onContinue={() => send({ type: 'continue-compare' })} onRequestReplacePhoto={() => send({ type: 'replace-photo' })} />;
  else if (state.route === 'summary' && summaryProps) content = <RecordSummaryScreen {...summaryProps} />;
  else if (state.route === 'image' && state.drafts.new) content = <ImageViewerScreen showConversionNotice={viewingStamp} locale={state.locale} source={viewerSource} accessibilityLabel={state.locale === 'ko' ? viewingStamp ? '컬러 스케치 이미지' : '원본 사진' : viewingStamp ? 'Color sketch' : 'Original photo'} aspectRatio={viewerAspectRatio} onClose={() => send({ type: 'close-image' })} />;
  else if (state.route === 'detail' && record && state.session) content = <DetailScreen actionsTriggerRef={dialogTriggerRef} locale={state.locale} images={images} record={record} sheet={state.sheet} image_missing={state.scenario === 'image-missing'} onBack={() => send({ type: 'back-book' })} onOpenRead={() => send({ type: 'open-read' })} onOpenActions={() => send({ type: 'open-actions' })} onRequestCloseSheet={() => send({ type: 'sheet-close' })} onEdit={() => send({ type: 'edit-record' })} onRequestDelete={() => send({ type: 'request-delete-record' })} onToggleFavorite={() => send({ type: 'toggle-favorite', recordId: record.id })} onRetryImage={() => send({ type: 'retry-image' })} />;
  else if (state.route === 'settings' && state.session) content = <SettingsScreen logoutTriggerRef={dialogTriggerRef} locale={state.locale} locale_preference={state.locale_preference} model_status={state.model_status} scenario={state.scenario} account_deletion={state.account_deletion} has_unsaved_work={Boolean(state.drafts.new || state.drafts.edit)} onBack={() => send({ type: 'back-settings' })} onChangeLocale={(value) => send({ type: 'locale', value })} onChangeScenario={(value: DemoScenario) => send({ type: 'scenario', value })} onRetryModel={() => send({ type: 'retry-model' })} onLogout={() => send({ type: 'logout' })} onDeleteAccount={() => send({ type: 'delete-account-request' })} onRetryAccountDeletion={() => send({ type: 'delete-account-request' })} />;

  return <React.Fragment key={fontScale}>{content}<DemoDialogs restoreFocusRef={dialogTriggerRef} locale={state.locale} dialog={state.dialog} scenario={state.scenario} send={send} canSaveBeforeLogout={canSaveBeforeLogout} /></React.Fragment>;
}
