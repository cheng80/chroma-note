import { cacheRecordSnapshot, cachedRecord, evictedRecordIds, filterCachedRecords, recordCacheFileName } from './record-cache-core.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const record = {
  source: 'supabase' as const, id: 'record-1', user_id: 'owner-a', status: 'ready' as const, version: 1, created_at: '2026-09-12T00:00:00Z', color_tags: [],
  stamp: { candidate_id: 'record-1', input_revision: 1, source: 'supabase' as const, local_uri: 'https://example.test/image.png?token=secret', image_headers: { Authorization: 'Bearer secret' }, width: 100, height: 100 },
  fields: { diary_date: '2026-09-12', date_source: 'user' as const, place_name: null, user_note: '', scene: null, semantic_tags: [], mood_tags: [], ai_field_note: '', ai_field_note_edited: null, is_favorite: false },
};
const snapshot = cacheRecordSnapshot('owner-a', record);
equal('image_headers' in snapshot.stamp, false);
equal(snapshot.stamp.local_uri, '');
equal(cachedRecord('owner-a', snapshot, 'file:///records/record-1.png')?.stamp.image_headers, undefined);
equal(cachedRecord('owner-a', snapshot, '')?.stamp.local_uri, '');
equal(cachedRecord('owner-b', snapshot, 'file:///records/record-1.png'), null);
equal(evictedRecordIds([{ record_id: 'a', image_bytes: 4, accessed_at: 1 }, { record_id: 'b', image_bytes: 4, accessed_at: 2 }], 5), ['a']);
equal(filterCachedRecords([record], { start_date: '2026-09-12', end_date: null, semantic_tag: null, favorite_only: false }).map((value) => value.id), ['record-1']);
equal(filterCachedRecords([record], { start_date: null, end_date: null, semantic_tag: '산책', favorite_only: false }), []);
try { recordCacheFileName('owner-a', '../record'); throw new Error('unsafe record id should fail'); } catch (error) { if (!(error instanceof Error) || error.message !== 'Invalid record cache owner or record id.') throw error; }
try { recordCacheFileName('owner-a', 'record/1'); throw new Error('unsafe cleanup record id should fail'); } catch (error) { if (!(error instanceof Error) || error.message !== 'Invalid record cache owner or record id.') throw error; }
console.log('record-cache.check passed');
