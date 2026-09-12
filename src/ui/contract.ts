import type { ImageSourcePropType, View } from 'react-native';
import type { RefObject } from 'react';
import type {
  DisplayLocale,
  DraftKind,
  DemoSession,
  ColorResult,
  RecordFields,
  DemoErrorCode,
  Draft,
  DemoRecord,
  BookFilter,
  SaveAttempt,
  ModelStatus,
  ActiveJob,
} from '../domain/record';

export type * from '../domain/record';

export const DEMO_CODE = '123456';
export const DEMO_IMAGE_WIDTH = 1264;
export const DEMO_IMAGE_HEIGHT = 848;
export const MEMORY_NOTICE = {
  ko: '화면을 오가도 유지되며, 앱을 다시 열면 초기화돼요.',
  en: 'Changes remain while you browse, then reset when the app restarts.',
} as const;

export type LocalePreference = 'system' | DisplayLocale;
export type BookListState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'filter-empty'
  | 'partial-cache'
  | 'error';

export type AnalysisSheetValue = Pick<
  RecordFields,
  'scene' | 'semantic_tags' | 'mood_tags' | 'ai_field_note_edited' | 'user_note'
>;
export type DatePlaceSheetValue = Pick<
  RecordFields,
  'diary_date' | 'date_source' | 'place_name'
>;

export type SheetState =
  | null
  | {
      kind: 'datePlace';
      initial: DatePlaceSheetValue;
      working: DatePlaceSheetValue;
      error: string | null;
    }
  | {
      kind: 'analysis';
      initial: AnalysisSheetValue;
      working: AnalysisSheetValue;
      error: string | null;
      caption_status: AsyncStatus;
      caption_suggestion: string | null;
      caption_request_id: string | null;
    }
  | { kind: 'colors'; value: ColorResult }
  | {
      kind: 'filter';
      initial: BookFilter;
      working: BookFilter;
      error: string | null;
    }
  | { kind: 'read'; record_id: string }
  | { kind: 'actions'; record_id: string };

export type SheetChange =
  | { kind: 'datePlace'; working: DatePlaceSheetValue }
  | { kind: 'analysis'; working: AnalysisSheetValue }
  | { kind: 'filter'; working: BookFilter };

export type DialogState =
  | null
  | { kind: 'discard-draft' }
  | { kind: 'discard-save'; draft_id: string }
  | { kind: 'replace-photo'; step: 'keep' | 'discard' }
  | { kind: 'adopt-candidate'; candidate_id: string }
  | { kind: 'delete-record'; record_id: string }
  | { kind: 'logout'; step: 'save' | 'discard' }
  | { kind: 'delete-account' };

export type DemoRoute =
  | 'email'
  | 'otp'
  | 'book'
  | 'photo'
  | 'processing'
  | 'compare'
  | 'summary'
  | 'detail'
  | 'settings'
  | 'image';

export type DemoScenario =
  | 'normal'
  | 'empty-book'
  | 'filter-empty'
  | 'partial-cache'
  | 'book-error'
  | 'otp-send-failed'
  | 'otp-error'
  | 'otp-expired'
  | 'otp-rate-limited'
  | 'prepare-failed'
  | 'color-failed'
  | 'analysis-failed'
  | 'stamp-failed'
  | 'draft-failed'
  | 'save-pending'
  | 'save-failed'
  | 'save-uncertain'
  | 'save-conflict'
  | 'delete-failed'
  | 'image-missing'
  | 'logout-offline'
  | 'account-delete-failed';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';
export type AccountDeletionStatus = 'idle' | 'reauth' | 'processing' | 'failed';

export interface AuthRequestState {
  request_id: string | null;
  email: string;
  status: AsyncStatus;
  error_code?: DemoErrorCode;
  resend_available_at?: number;
}

export interface DemoState {
  route: DemoRoute;
  locale_preference: LocalePreference;
  locale: DisplayLocale;
  scenario: DemoScenario;
  email: string;
  code: string;
  auth: AuthRequestState;
  session: DemoSession | null;
  model_status: ModelStatus;
  records: DemoRecord[];
  drafts: Record<DraftKind, Draft | null>;
  active_draft_kind: DraftKind | null;
  selected_record_id: string | null;
  book_filter: BookFilter;
  book_state: BookListState;
  page_size: number;
  comparison_tab: 'photo' | 'stamp';
  active_job: ActiveJob | null;
  sheet: SheetState;
  dialog: DialogState;
  save_attempt: SaveAttempt | null;
  account_deletion: AccountDeletionStatus;
}

export interface DemoImageSources {
  photo: ImageSourcePropType;
  stamp: ImageSourcePropType;
}

export interface DemoImageAsset {
  source: ImageSourcePropType;
  width: number;
  height: number;
  aspect_ratio: number;
}

export interface EmailScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  email: string;
  status: AsyncStatus;
  error_code?: DemoErrorCode;
  onChangeEmail: (email: string) => void;
  onSubmit: () => void;
}

export interface OtpScreenProps {
  locale: DisplayLocale;
  email: string;
  code: string;
  status: AsyncStatus;
  error_code?: DemoErrorCode;
  resend_seconds: number;
  onChangeCode: (code: string) => void;
  onVerify: () => void;
  onChangeEmail: () => void;
  onResend: () => void;
}

export interface BookScreenProps {
  locale: DisplayLocale;
  session: DemoSession;
  images: DemoImageSources;
  records: DemoRecord[];
  drafts: Draft[];
  filter: BookFilter;
  list_state: BookListState;
  pending_deletions?: string[];
  model_status: ModelStatus;
  save_attempt: SaveAttempt | null;
  sheet: SheetState;
  has_more: boolean;
  refreshing?: boolean;
  onOpenSettings: () => void;
  onStartRecord: () => void;
  onResumeDraft: (draft_id: string) => void;
  onDeleteDraft: (draft_id: string) => void;
  onOpenRecord: (record_id: string) => void;
  onToggleFavorite: (record_id: string) => void;
  onOpenFilter: () => void;
  onChangeSheet: (change: SheetChange) => void;
  onApplySheet: () => void;
  onCancelSheet: () => void;
  onRequestCloseSheet: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  importTriggerRef?: RefObject<View | null>;
}

export interface DetailScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  record: DemoRecord;
  sheet: SheetState;
  image_missing: boolean;
  onBack: () => void;
  onOpenRead: () => void;
  onOpenActions: () => void;
  onRequestCloseSheet: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onToggleFavorite: () => void;
  onRetryImage: () => void;
  actionsTriggerRef?: RefObject<View | null>;
}

export interface SettingsScreenProps {
  locale: DisplayLocale;
  locale_preference: LocalePreference;
  model_status: ModelStatus;
  scenario: DemoScenario;
  account_deletion: AccountDeletionStatus;
  has_unsaved_work: boolean;
  onBack: () => void;
  onChangeLocale: (preference: LocalePreference) => void;
  onChangeScenario: (scenario: DemoScenario) => void;
  onLogout: () => void;
  onRetryModel?: () => void;
  onDeleteAccount: () => void;
  onRetryAccountDeletion: () => void;
  logoutTriggerRef?: RefObject<View | null>;
}

export interface PhotoInputScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  draft: Draft | null;
  onUseDemoPhoto: () => void;
  onContinue: () => void;
  onCancel: () => void;
  onRequestReplace: () => void;
  replacePhotoTriggerRef?: RefObject<View | null>;
}

export interface ProcessingScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  draft: Draft;
  active_job: ActiveJob | null;
  model_status: ModelStatus;
  onCancel: () => void;
  onRetry: () => void;
  onSkipAnalysis: () => void;
  onChangePhoto: () => void;
  replacePhotoTriggerRef?: RefObject<View | null>;
}

export interface CompareScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  draft: Draft;
  active_tab: 'photo' | 'stamp';
  busy: boolean;
  blocking_reason: string | null;
  onBack: () => void;
  onChangeTab: (tab: 'photo' | 'stamp') => void;
  onOpenOriginal: () => void;
  onConfirmChange: (checked: boolean) => void;
  onContinue: () => void;
  onRequestReplacePhoto: () => void;
  replacePhotoTriggerRef?: RefObject<View | null>;
}

export interface RecordSummaryScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  draft: Draft;
  sheet: SheetState;
  save_attempt: SaveAttempt | null;
  blocking_reason: string | null;
  onBack: () => void;
  onClose: () => void;
  onOpenSheet: (kind: 'datePlace' | 'analysis' | 'colors') => void;
  onChangeSheet: (change: SheetChange) => void;
  onApplySheet: () => void;
  onCancelSheet: () => void;
  onRequestCloseSheet: () => void;
  onRequestCaption: () => void;
  onSave: () => void;
  onRetrySave: () => void;
  onDiscardSave: () => void;
  discardSaveTriggerRef?: RefObject<View | null>;
}

export interface ImageViewerScreenProps {
  locale: DisplayLocale;
  showConversionNotice?: boolean;
  source: ImageSourcePropType;
  accessibilityLabel: string;
  aspectRatio: number;
  onClose: () => void;
}
