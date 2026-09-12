export interface RecordCursor {
  diary_date: string;
  created_at: string;
  id: string;
}

export type RecordErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'network'
  | 'image_missing'
  | 'unknown';

export class RecordError extends Error {
  readonly code: RecordErrorCode;
  readonly retryAfterMilliseconds?: number;

  constructor(code: RecordErrorCode, retryAfterMilliseconds?: number) {
    super(code);
    this.name = 'RecordError';
    this.code = code;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
  }
}

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;

function retryAfterHeader(error: unknown): string | null {
  const details = error as { retryAfterMilliseconds?: unknown; headers?: unknown; context?: unknown; response?: unknown } | null;
  if (typeof details?.retryAfterMilliseconds === 'number') return String(details.retryAfterMilliseconds / 1_000);
  const source = (details?.context ?? details?.response ?? details) as { headers?: { get?: (name: string) => string | null } } | null;
  return source?.headers?.get?.('retry-after') ?? null;
}

export function retryAfterMilliseconds(error: unknown, now = Date.now()): number | undefined {
  const header = retryAfterHeader(error);
  if (header === null) return undefined;
  const milliseconds = /^\d+$/.test(header.trim()) ? Number(header.trim()) * 1_000 : Date.parse(header) - now;
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : undefined;
}

function statusFrom(error: unknown): unknown {
  const details = error as { status?: unknown; statusCode?: unknown; context?: unknown } | null;
  const context = details?.context as { status?: unknown } | null;
  return details?.status ?? details?.statusCode ?? context?.status;
}

export function retryDelayMilliseconds(error: unknown, retryIndex: number, now = Date.now()): number | null {
  const fallback = RETRY_DELAYS_MS[retryIndex];
  if (fallback === undefined) return null;
  const code = errorCode(error);
  if (code === 'network') return fallback;
  if (code !== 'rate_limited') return null;
  const retryAfter = retryAfterMilliseconds(error, now);
  if (retryAfter === undefined) return fallback;
  return retryAfter <= RETRY_DELAYS_MS.at(-1)! ? retryAfter : null;
}

export function durationMilliseconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RecordError('validation');
  return Math.round(value);
}

export function canonicalJson(value: unknown): string {
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new RecordError('validation');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return atob(padded);
}

export function encodeCursor(cursor: RecordCursor) {
  return encodeBase64Url(JSON.stringify(cursor));
}

export function decodeCursor(value: string): RecordCursor {
  try {
    const cursor = JSON.parse(decodeBase64Url(value)) as Partial<RecordCursor>;
    if (!cursor || typeof cursor.diary_date !== 'string' || typeof cursor.created_at !== 'string' || typeof cursor.id !== 'string' || !isDate(cursor.diary_date) || !isTimestamp(cursor.created_at) || !/^[A-Za-z0-9-]{1,128}$/.test(cursor.id)) throw new Error('invalid cursor');
    return cursor as RecordCursor;
  } catch {
    throw new RecordError('validation');
  }
}

export function sessionIdFromAccessToken(accessToken: string): string {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) throw new Error('missing payload');
    const claims = JSON.parse(decodeBase64Url(payload)) as { session_id?: unknown };
    if (typeof claims.session_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.session_id)) throw new Error('missing session id');
    return claims.session_id;
  } catch {
    throw new RecordError('unauthorized');
  }
}

export function errorCode(error: unknown): RecordErrorCode {
  if (error instanceof RecordError) return error.code;
  const details = error as { code?: unknown; name?: unknown; context?: unknown; originalError?: unknown; cause?: unknown } | null;
  const rawStatus = statusFrom(error);
  const status = typeof rawStatus === 'number' ? rawStatus
    : typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus) ? Number(rawStatus) : undefined;
  const code = typeof details?.code === 'string' ? details.code.toLowerCase() : '';
  const name = typeof details?.name === 'string' ? details.name : '';
  if (status === 401 || ['unauthorized', 'bad_jwt', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used'].includes(code)) return 'unauthorized';
  if (status === 403 || code === 'forbidden') return 'forbidden';
  if (status === 404 || code === 'not_found' || code === 'pgrst116') return 'not_found';
  if (status === 409 || code === 'conflict') return 'conflict';
  if (status === 429 || code === 'rate_limited') return 'rate_limited';
  if (status === 400 || status === 413 || code === 'validation') return 'validation';
  if (status === 0 || (status !== undefined && status >= 500) || error instanceof TypeError || ['AbortError', 'AuthRetryableFetchError', 'FunctionsFetchError', 'FunctionsRelayError', 'StorageUnknownError'].includes(name)) return 'network';
  for (const nested of [details?.context, details?.originalError, details?.cause]) {
    if (nested && nested !== error && errorCode(nested) === 'network') return 'network';
  }
  return 'unknown';
}

export function isGeneratedLineArtUri(uri: string, ownerId?: string, documentsUri?: string) {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:' || url.host || url.search || url.hash) return false;
    const path = decodeURIComponent(url.pathname);
    const fileName = path.split('/').at(-1) ?? '';
    if (path.split('/').includes('..') || !/^lineart-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i.test(fileName)) return false;
    if (ownerId !== undefined && (!ownerId || ownerId.includes('/') || !path.includes(`/chroma-drafts/${ownerId}/`))) return false;
    if (documentsUri !== undefined) {
      if (ownerId === undefined) return false;
      const documents = new URL(documentsUri);
      if (documents.protocol !== 'file:' || documents.host || documents.search || documents.hash) return false;
      const root = decodeURIComponent(documents.pathname).replace(/\/$/, '');
      if (path !== `${root}/chroma-drafts/${ownerId}/${fileName}`) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function analysisModifiedFields(
  fields: { scene: string | null; semantic_tags: string[]; mood_tags: string[]; ai_field_note_edited: string | null },
  analysis: { scene: string | null; semantic_tags: string[]; mood: string[]; ai_field_note_edited: string | null },
) {
  return [
    fields.scene !== analysis.scene && 'scene',
    (fields.semantic_tags.length !== analysis.semantic_tags.length || fields.semantic_tags.some((value, index) => value !== analysis.semantic_tags[index])) && 'semantic_tags',
    (fields.mood_tags.length !== analysis.mood.length || fields.mood_tags.some((value, index) => value !== analysis.mood[index])) && 'mood_tags',
    fields.ai_field_note_edited !== analysis.ai_field_note_edited && 'ai_field_note_edited',
  ].filter((field): field is string => Boolean(field));
}

export function validCreateSelection(stamp: { candidate_id: string; input_revision: number; source: string; local_uri: string }, confirmation: { candidate_id: string; input_revision: number } | null) {
  return Boolean(confirmation
    && confirmation.candidate_id === stamp.candidate_id
    && confirmation.input_revision === stamp.input_revision
    && stamp.source === 'device'
    && isGeneratedLineArtUri(stamp.local_uri));
}
