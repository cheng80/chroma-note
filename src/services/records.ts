import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { createClient } from '@supabase/supabase-js';

import type { BookFilter, ColorTag, DemoOwnerId, DemoRecord, RecordFields, SaveAttempt, StampCandidate } from '../ui/contract';
import { getSupabase } from './supabase';
import { analysisModifiedFields, canonicalJson, decodeCursor, encodeCursor, errorCode, isGeneratedLineArtUri, RecordError, sessionIdFromAccessToken, validCreateSelection, type RecordCursor } from './records-core';

export { RecordError, type RecordErrorCode } from './records-core';

const PAGE_SIZE = 30;
const STAMP_BUCKET = 'stamp-images';
const editableFields = ['diary_date', 'date_source', 'place_name', 'user_note', 'scene', 'semantic_tags', 'mood_tags', 'ai_field_note_edited', 'is_favorite'] as const;

interface StoredRecord {
  id: string;
  user_id: string;
  status: string;
  version: number;
  stamp_image_path: string;
  creation_operation_id?: string;
  creation_payload_hash?: string;
  last_operation_id?: string;
  payload_hash?: string;
  width: number;
  height: number;
  color_tags: ColorTag[];
  created_at: string;
  diary_date: string;
  date_source: RecordFields['date_source'];
  place_name: string | null;
  user_note: string;
  scene: string | null;
  semantic_tags: string[];
  mood_tags: string[];
  ai_field_note: string | null;
  ai_field_note_edited: string | null;
  is_favorite: boolean;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: Uint8Array | string) {
  if (typeof value === 'string') return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  return hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, Uint8Array.from(value)));
}

function requireOwner(ownerId: DemoOwnerId, userId: string | undefined) {
  if (!userId || ownerId !== userId) throw new RecordError('unauthorized');
}

type ScopedClient = ReturnType<typeof getSupabase>;

type AuthContext = {
  ownerId: DemoOwnerId;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  client: ScopedClient;
};

function publicSupabaseConfig() {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!baseUrl || !key) throw new RecordError('unauthorized');
  return { baseUrl, key };
}

function scopedClient(accessToken: string): ScopedClient {
  const { baseUrl, key } = publicSupabaseConfig();
  return createClient(baseUrl, key, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function contextFromSession(ownerId: DemoOwnerId, session: { access_token?: string; refresh_token?: string } | null | undefined): Promise<AuthContext> {
  if (!session?.access_token || !session.refresh_token) throw new RecordError('unauthorized');
  const { data, error } = await getSupabase().auth.getUser(session.access_token);
  if (error || !data.user) throw new RecordError('unauthorized');
  requireOwner(ownerId, data.user.id);
  return {
    ownerId,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    sessionId: sessionIdFromAccessToken(session.access_token),
    client: scopedClient(session.access_token),
  };
}

async function sessionFor(ownerId: DemoOwnerId) {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw new RecordError('unauthorized');
  return contextFromSession(ownerId, data.session);
}

async function refreshContext(context: AuthContext): Promise<AuthContext> {
  const { data, error } = await getSupabase().auth.refreshSession({ refresh_token: context.refreshToken });
  if (error) throw new RecordError('unauthorized');
  const refreshed = await contextFromSession(context.ownerId, data.session);
  if (refreshed.sessionId !== context.sessionId) throw new RecordError('unauthorized');
  return refreshed;
}

async function onceAfterRefresh<T>(context: AuthContext, request: (context: AuthContext) => Promise<T>, canRefresh = true): Promise<T> {
  try {
    return await request(context);
  } catch (error) {
    if (!canRefresh || errorCode(error) !== 'unauthorized') throw asRecordError(error);
    try {
      Object.assign(context, await refreshContext(context));
      return await request(context);
    } catch (retryError) {
      throw asRecordError(retryError);
    }
  }
}

function asRecordError(error: unknown) {
  return error instanceof RecordError ? error : new RecordError(errorCode(error));
}

function lifecycleError(code: string | undefined) {
  if (code === 'version_conflict' || code === 'payload_hash_conflict') return new RecordError('conflict');
  if (code === 'invalid_image' || code === 'invalid_png' || code === 'image_too_large' || code === 'payload_too_large' || code === 'payload_hash_mismatch') return new RecordError('validation');
  if (code === 'account_locked' || code === 'reauth_required') return new RecordError('forbidden');
  if (code === 'backend_unavailable' || code === 'cleanup_pending') return new RecordError('network');
  return new RecordError(errorCode({ code }));
}

function assertImageBytes(bytes: Uint8Array) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || !png.every((byte, index) => bytes[index] === byte)) throw new RecordError('validation');
}

async function finalStampBytes(stamp: StampCandidate, ownerId: DemoOwnerId): Promise<Uint8Array> {
  if (stamp.source !== 'device' || !stamp.processing || !isGeneratedLineArtUri(stamp.local_uri, ownerId, Paths.document.uri)) throw new RecordError('validation');
  const file = new File(stamp.local_uri);
  if (!file.exists) throw new RecordError('image_missing');
  let bytes: Uint8Array;
  try { bytes = await file.bytes(); }
  catch { throw new RecordError('image_missing'); }
  assertImageBytes(bytes);
  return bytes;
}

function editable(fields: RecordFields) {
  return Object.fromEntries(editableFields.map((key) => [key, fields[key]]));
}

function metadataFor(attempt: SaveAttempt) {
  const snapshot = attempt.payload_snapshot;
  const analysis = snapshot.analysis;
  const processing = snapshot.stamp.processing;
  if (!analysis || analysis.source !== 'device' || analysis.source_revision !== snapshot.stamp.input_revision || !processing) throw new RecordError('validation');
  if ((analysis.status === 'success' && !analysis.model_version) || (analysis.status === 'skipped' && analysis.model_version)) throw new RecordError('validation');
  const inputDimensions = snapshot.input_dimensions;
  if (!inputDimensions || inputDimensions.some((value) => !Number.isInteger(value) || value < 1 || value > 2048)) throw new RecordError('validation');
  if (snapshot.locale !== 'ko' && snapshot.locale !== 'en') throw new RecordError('validation');
  const changed = analysisModifiedFields(snapshot.fields, analysis);
  return {
    analysis_meta: { schema_version: 1, status: analysis.status, ai_scene: analysis.scene, ai_tags: analysis.semantic_tags, ai_mood: analysis.mood, language: snapshot.locale, user_modified_fields: changed },
    model_meta: {
      source_revision: snapshot.stamp.input_revision,
      ...(analysis.status === 'success' ? { vlm: { model_id: analysis.model_version } } : {}),
      line: { model_id: processing.model_id, revision: processing.revision, runtime_version: processing.runtime_version, quantization: processing.quantization, inference_duration_ms: processing.inference_duration_ms },
    },
    style_meta: { style_id: 'ink-v1', line_model_style: 'style1', max_edge: processing.max_edge, mask_gain: processing.mask_gain, background: 'white', postprocess_version: processing.postprocess_version, input_dimensions: inputDimensions, output_dimensions: [snapshot.stamp.width, snapshot.stamp.height], fit: 'contain' },
  };
}

async function invoke(context: AuthContext, action: string, body: Record<string, unknown>, canRefresh = true): Promise<Record<string, unknown>> {
  return onceAfterRefresh(context, async (activeContext) => {
    const { data, error } = await activeContext.client.functions.invoke('record-lifecycle', {
      body: { action, ...body },
      headers: { Authorization: `Bearer ${activeContext.accessToken}` },
    });
    if (error) {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const response = await context?.json?.().catch(() => null);
      const details = response && typeof response === 'object' && 'error' in response ? (response as { error?: unknown }).error : response;
      if (details && typeof details === 'object' && 'code' in details) {
        const code = (details as { code?: string }).code;
        throw lifecycleError(code);
      }
      throw error;
    }
    if (!data || typeof data !== 'object') throw new RecordError('unknown');
    if ('error' in data && data.error) {
      const responseError = data.error as { code?: string };
      throw lifecycleError(responseError.code);
    }
    return data as Record<string, unknown>;
  }, canRefresh);
}

function authenticatedStamp(path: string, accessToken: string) {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key) throw new RecordError('unauthorized');
  return {
    local_uri: `${baseUrl}/storage/v1/object/authenticated/${STAMP_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
    image_headers: { Authorization: `Bearer ${accessToken}`, apikey: key },
  };
}

function recordFromRow(row: StoredRecord, accessToken: string): DemoRecord {
  const image = authenticatedStamp(row.stamp_image_path, accessToken);
  return {
    source: 'supabase',
    id: row.id,
    user_id: row.user_id,
    status: 'ready',
    version: row.version,
    stamp: { candidate_id: row.id, input_revision: 1, width: row.width, height: row.height, source: 'supabase', ...image },
    color_tags: row.color_tags,
    fields: {
      diary_date: row.diary_date,
      date_source: row.date_source,
      place_name: row.place_name,
      user_note: row.user_note,
      scene: row.scene,
      semantic_tags: row.semantic_tags,
      mood_tags: row.mood_tags,
      ai_field_note: row.ai_field_note ?? '',
      ai_field_note_edited: row.ai_field_note_edited,
      is_favorite: row.is_favorite,
    },
    created_at: row.created_at,
  };
}

function queryCursor(cursor: RecordCursor) {
  return `diary_date.lt.${cursor.diary_date},and(diary_date.eq.${cursor.diary_date},created_at.lt.${cursor.created_at}),and(diary_date.eq.${cursor.diary_date},created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

function postgrestArrayValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function savedRecord(row: StoredRecord, attempt: SaveAttempt, payloadHash: string) {
  if (row.id !== attempt.record_id || row.user_id !== attempt.owner_id || row.status !== 'ready') throw new RecordError('conflict');
  if (row.last_operation_id !== attempt.operation_id || row.payload_hash !== payloadHash) throw new RecordError('conflict');
  if (attempt.base_version === undefined && (row.creation_operation_id !== attempt.operation_id || row.creation_payload_hash !== payloadHash)) throw new RecordError('conflict');
  return row;
}

function reservedRecord(row: StoredRecord, attempt: SaveAttempt) {
  const path = `${attempt.owner_id}/${attempt.record_id}/stamp.png`;
  if (row.id !== attempt.record_id || row.user_id !== attempt.owner_id || row.stamp_image_path !== path || !['uploading', 'ready'].includes(row.status)) throw new RecordError('conflict');
  return row;
}

export async function listRecords(ownerId: DemoOwnerId, filter: BookFilter, cursor?: string): Promise<{ records: DemoRecord[]; cursor: string | null }> {
  const context = await sessionFor(ownerId);
  return onceAfterRefresh(context, async (activeContext) => {
    let query = activeContext.client.from('stamp_records').select('*').eq('status', 'ready').order('diary_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1);
    if (filter.start_date) query = query.gte('diary_date', filter.start_date);
    if (filter.end_date) query = query.lte('diary_date', filter.end_date);
    if (filter.semantic_tag) {
      const tag = postgrestArrayValue(filter.semantic_tag);
      query = query.or(`semantic_tags.cs.{${tag}},mood_tags.cs.{${tag}}`);
    }
    if (filter.favorite_only) query = query.eq('is_favorite', true);
    if (cursor) query = query.or(queryCursor(decodeCursor(cursor)));
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as StoredRecord[];
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return {
      records: page.map((row) => recordFromRow(row, activeContext.accessToken)),
      cursor: rows.length > PAGE_SIZE && last ? encodeCursor({ diary_date: last.diary_date, created_at: last.created_at, id: last.id }) : null,
    };
  });
}

export async function fetchRecord(ownerId: DemoOwnerId, id: string): Promise<DemoRecord | null> {
  try {
    const context = await sessionFor(ownerId);
    return await onceAfterRefresh(context, async (activeContext) => {
      const { data, error } = await activeContext.client.from('stamp_records').select('*').eq('id', id).eq('status', 'ready').maybeSingle();
      if (error) throw error;
      return data ? recordFromRow(data as StoredRecord, activeContext.accessToken) : null;
    });
  } catch (error) {
    if (error instanceof RecordError && error.code === 'not_found') return null;
    throw error;
  }
}

export async function saveRecord(attempt: SaveAttempt): Promise<DemoRecord> {
  const snapshot = attempt.payload_snapshot;
  const context = await sessionFor(attempt.owner_id);
  if (attempt.base_version !== undefined) {
    const payload = editable(snapshot.fields);
    const payload_hash = await sha256(canonicalJson(payload));
    const data = await invoke(context, 'edit', { record_id: attempt.record_id, operation_id: attempt.operation_id, payload_hash, payload, base_version: attempt.base_version });
    if (!data.record) throw new RecordError('unknown');
    return recordFromRow(savedRecord(data.record as StoredRecord, attempt, payload_hash), context.accessToken);
  }

  if (!validCreateSelection(snapshot.stamp, snapshot.confirmation)) throw new RecordError('validation');
  const bytes = await finalStampBytes(snapshot.stamp, attempt.owner_id);
  const payload = {
    ...snapshot.fields,
    color_tags: snapshot.color_tags,
    ...metadataFor(attempt),
    stamp: { sha256: await sha256(bytes), bytes: bytes.length, width: snapshot.stamp.width, height: snapshot.stamp.height },
  };
  const payload_hash = await sha256(canonicalJson(payload));
  const began = await invoke(context, 'begin', { record_id: attempt.record_id, operation_id: attempt.operation_id, payload_hash, payload });
  const begunRecord = began.record as StoredRecord | undefined;
  if (!begunRecord) throw new RecordError('unknown');
  const reserved = reservedRecord(begunRecord, attempt);
  if (reserved.status === 'ready') return recordFromRow(savedRecord(reserved, attempt, payload_hash), context.accessToken);

  await onceAfterRefresh(context, async (activeContext) => {
    const { error } = await activeContext.client.storage.from(STAMP_BUCKET).upload(reserved.stamp_image_path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
      contentType: 'image/png',
      headers: { Authorization: `Bearer ${activeContext.accessToken}` },
      upsert: false,
    });
    if (error && errorCode(error) !== 'conflict' && !/already exists/i.test(error.message)) throw error;
  });
  const finalized = await invoke(context, 'finalize', { record_id: attempt.record_id, operation_id: attempt.operation_id, payload_hash });
  if (!finalized.record) throw new RecordError('unknown');
  return recordFromRow(savedRecord(finalized.record as StoredRecord, attempt, payload_hash), context.accessToken);
}

export async function setFavorite(record: DemoRecord): Promise<DemoRecord> {
  const context = await sessionFor(record.user_id);
  const payload = { is_favorite: !record.fields.is_favorite };
  const operationId = Crypto.randomUUID();
  const payloadHash = await sha256(canonicalJson(payload));
  const data = await invoke(context, 'edit', { record_id: record.id, operation_id: operationId, payload_hash: payloadHash, payload, base_version: record.version });
  if (!data.record) throw new RecordError('unknown');
  const row = data.record as StoredRecord;
  if (row.id !== record.id || row.user_id !== record.user_id || row.status !== 'ready' || row.last_operation_id !== operationId || row.payload_hash !== payloadHash) throw new RecordError('conflict');
  return recordFromRow(row, context.accessToken);
}

export async function deleteRecord(ownerId: DemoOwnerId, id: string, baseVersion: number): Promise<void> {
  const context = await sessionFor(ownerId);
  const payload = {};
  await invoke(context, 'delete', { record_id: id, operation_id: id, payload_hash: await sha256(canonicalJson(payload)), payload, base_version: baseVersion });
}
