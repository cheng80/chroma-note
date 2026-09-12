export type DisplayLocale = 'ko' | 'en';

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
  | 'model_missing'
  | 'model_corrupt'
  | 'model_unsupported'
  | 'model_out_of_memory'
  | 'model_timeout'
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

export type PhotoStepResult =
  | { step: 'prepare' }
  | { step: 'colors'; colors: ColorResult }
  | { step: 'analysis'; analysis: Analysis }
  | { step: 'stamp'; stamp: StampCandidate };
