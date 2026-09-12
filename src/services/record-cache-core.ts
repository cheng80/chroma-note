import type { BookFilter, DemoOwnerId, DemoRecord } from '../domain/record';

export const RECORD_CACHE_LIMIT_BYTES = 200 * 1024 * 1024;

function safeSegment(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function recordCacheFileName(ownerId: DemoOwnerId, recordId: string) {
  if (!safeSegment(ownerId) || !safeSegment(recordId)) throw new Error('Invalid record cache owner or record id.');
  return `${recordId}.png`;
}

export function cacheRecordSnapshot(ownerId: DemoOwnerId, record: DemoRecord): DemoRecord {
  if (record.source !== 'supabase' || record.status !== 'ready' || record.user_id !== ownerId) throw new Error('Record cache belongs to another account.');
  recordCacheFileName(ownerId, record.id);
  const { image_headers: _imageHeaders, ...stamp } = record.stamp;
  return { ...record, stamp: { ...stamp, source: 'supabase', local_uri: '' } };
}

export function cachedRecord(ownerId: DemoOwnerId, snapshot: unknown, localUri: string): DemoRecord | null {
  const record = snapshot as DemoRecord | null;
  if (!record || record.source !== 'supabase' || record.status !== 'ready' || record.user_id !== ownerId || !record.stamp) return null;
  try { recordCacheFileName(ownerId, record.id); }
  catch { return null; }
  const { image_headers: _imageHeaders, ...stamp } = record.stamp;
  return { ...record, stamp: { ...stamp, source: 'supabase', local_uri: localUri } };
}

export function evictedRecordIds(rows: { record_id: string; image_bytes: number; accessed_at: number }[], limit = RECORD_CACHE_LIMIT_BYTES) {
  let total = rows.reduce((sum, row) => sum + Math.max(0, row.image_bytes), 0);
  const evicted: string[] = [];
  for (const row of [...rows].sort((a, b) => a.accessed_at - b.accessed_at)) {
    if (total <= limit) break;
    total -= Math.max(0, row.image_bytes);
    evicted.push(row.record_id);
  }
  return evicted;
}

export function filterCachedRecords(records: DemoRecord[], filter: BookFilter) {
  return records.filter((record) =>
    (!filter.start_date || record.fields.diary_date >= filter.start_date)
    && (!filter.end_date || record.fields.diary_date <= filter.end_date)
    && (!filter.favorite_only || record.fields.is_favorite)
    && (!filter.semantic_tag || [...record.fields.semantic_tags, ...record.fields.mood_tags].includes(filter.semantic_tag)),
  );
}
