import type { ImageSourcePropType } from 'react-native';

export const DEMO_CODE = '123456';
export const DEMO_IMAGE_WIDTH = 1264;
export const DEMO_IMAGE_HEIGHT = 848;
export const MEMORY_NOTICE = {
  ko: '화면을 오가도 유지되며, 앱을 다시 열면 초기화돼요.',
  en: 'Changes remain while you browse, then reset when the app restarts.',
} as const;

export type DisplayLocale = 'ko' | 'en';
export type LocalePreference = 'system' | DisplayLocale;
export type DemoOwnerId = string;
export type DraftKind = 'new' | 'edit';

export interface DemoSession {
  source: 'demo' | 'supabase';
  owner_id: DemoOwnerId;
  generation: number;
  email: string;
  locale: DisplayLocale;
}

export interface PhotoInput {
  local_uri: string;
  width: number;
  height: number;
  input_revision: number;
  source: 'demo' | 'device';
}

export interface ColorTag {
  hex: string;
  rgb: [number, number, number];
  weight: number;
}

export interface ColorResult {
  source: 'demo' | 'device' | 'supabase';
  source_revision: number;
  tags: ColorTag[];
}

export type DateSource = 'exif' | 'device' | 'user';

export interface RecordFields {
  diary_date: string;
  date_source: DateSource;
  place_name: string | null;
  user_note: string;
  scene: string | null;
  semantic_tags: string[];
  mood_tags: string[];
  ai_field_note: string;
  ai_field_note_edited: string | null;
  is_favorite: boolean;
}

export type RecordFieldKey = keyof RecordFields;

export interface Analysis {
  source: 'demo' | 'device';
  model_version?: string;
  source_revision: number;
  status: 'success' | 'skipped';
  scene: string | null;
  semantic_tags: string[];
  mood: string[];
  ai_field_note: string;
  ai_field_note_edited: string | null;
  user_modified_fields: RecordFieldKey[];
}

export interface StampCandidate {
  candidate_id: string;
  input_revision: number;
  local_uri: string;
  width: number;
  height: number;
  source: 'demo' | 'supabase' | 'device';
  image_headers?: Record<string, string>;
  processing?: {
    model_id: string;
    revision: string;
    runtime_version: string;
    quantization: string;
    inference_duration_ms: number;
    max_edge: number;
    mask_gain: number;
    postprocess_version: string;
  };
}

export interface CandidateConfirmation {
  input_revision: number;
  candidate_id: string;
}

export type DraftStage =
  | 'photo_ready'
  | 'preparing'
  | 'colors'
  | 'analysis'
  | 'stamp'
  | 'compare'
  | 'summary'
  | 'save_pending'
  | 'interrupted';

export type DemoErrorCode =
  | 'email_invalid'
  | 'send_failed'
  | 'otp_invalid'
  | 'otp_expired'
  | 'rate_limited'
  | 'prepare_failed'
  | 'color_failed'
  | 'analysis_failed'
  | 'stamp_failed'
  | 'draft_failed'
  | 'offline'
  | 'save_failed'
  | 'save_uncertain'
  | 'conflict'
  | 'not_found'
  | 'image_missing'
  | 'validation_failed'
  | 'delete_failed'
  | 'canceled'
  | 'interrupted';

export interface Draft {
  draft_id: string;
  owner_id: DemoOwnerId;
  record_id: string;
  kind: DraftKind;
  input_revision: number;
  stage: DraftStage;
  photo: PhotoInput;
  colors: ColorResult | null;
  analysis: Analysis | null;
  selected_candidate: StampCandidate | null;
  pending_candidate?: StampCandidate | null;
  confirmation: CandidateConfirmation | null;
  fields: RecordFields;
  base_record_version?: number;
  operation_id?: string;
  error_code?: DemoErrorCode;
}

export interface DemoRecord {
  source: 'demo' | 'supabase';
  id: string;
  user_id: DemoOwnerId;
  status: 'ready';
  version: number;
  stamp: StampCandidate;
  color_tags: ColorTag[];
  fields: RecordFields;
  created_at: string;
}

export interface BookFilter {
  start_date: string | null;
  end_date: string | null;
  semantic_tag: string | null;
  favorite_only: boolean;
}

export type BookListState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'filter-empty'
  | 'partial-cache'
  | 'error';

export interface SavePayloadSnapshot {
  stamp: StampCandidate;
  color_tags: ColorTag[];
  confirmation: CandidateConfirmation | null;
  fields: RecordFields;
  analysis?: Analysis;
  input_dimensions?: [number, number];
  locale?: DisplayLocale;
}

export type SaveState =
  | 'pending'
  | 'uploading'
  | 'finalizing'
  | 'uncertain'
  | 'failed'
  | 'conflict'
  | 'saved'
  | 'demo_saved';

export interface SaveAttempt {
  operation_id: string;
  draft_id: string;
  record_id: string;
  owner_id: DemoOwnerId;
  base_version?: number;
  payload_snapshot: SavePayloadSnapshot;
  state: SaveState;
  error_code?: DemoErrorCode;
}

export type ModelStatus =
  | 'not-connected'
  | 'unprepared'
  | 'preparing'
  | 'ready'
  | 'failed';

export type ProcessStep = 'prepare' | 'colors' | 'analysis' | 'stamp';

export interface ActiveJob {
  job_id: string;
  owner_id: DemoOwnerId;
  generation: number;
  input_revision: number;
  step: ProcessStep;
  status: 'running' | 'failed';
  error_code?: DemoErrorCode;
}

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

export type DemoServiceResult<T> =
  | {
      source: 'demo';
      outcome: 'success';
      value: T;
      job_id?: string;
      input_revision?: number;
    }
  | {
      source: 'demo';
      outcome: 'failure' | 'canceled' | 'uncertain' | 'conflict';
      error_code: DemoErrorCode;
      value?: T;
      job_id?: string;
      input_revision?: number;
    };

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
  model_status: ModelStatus;
  save_attempt: SaveAttempt | null;
  sheet: SheetState;
  has_more: boolean;
  refreshing?: boolean;
  onOpenSettings: () => void;
  onStartRecord: () => void;
  onResumeDraft: (draft_id: string) => void;
  onOpenRecord: (record_id: string) => void;
  onToggleFavorite: (record_id: string) => void;
  onOpenFilter: () => void;
  onChangeSheet: (change: SheetChange) => void;
  onApplySheet: () => void;
  onCancelSheet: () => void;
  onRequestCloseSheet: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
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
  onDeleteAccount: () => void;
  onRetryAccountDeletion: () => void;
}

export interface PhotoInputScreenProps {
  locale: DisplayLocale;
  images: DemoImageSources;
  draft: Draft | null;
  onUseDemoPhoto: () => void;
  onContinue: () => void;
  onCancel: () => void;
  onRequestReplace: () => void;
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
}

export interface ImageViewerScreenProps {
  locale: DisplayLocale;
  source: ImageSourcePropType;
  accessibilityLabel: string;
  aspectRatio: number;
  onClose: () => void;
}
