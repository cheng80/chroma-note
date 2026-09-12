import type { BookFilter, DemoOwnerId, DemoRecord } from '../domain/record';

export type PendingRecordDeletion = { record_id: string; base_version: number; requested_at: number };

export async function drainRecordCacheCleanup(_ownerId: DemoOwnerId) {}
export async function cacheRecords(_ownerId: DemoOwnerId, _records: DemoRecord[], _signal?: AbortSignal) {}
export async function readRecordCache(_ownerId: DemoOwnerId, _filter: BookFilter): Promise<DemoRecord[]> { return []; }
export async function cacheRecordImage(_ownerId: DemoOwnerId, record: DemoRecord, _signal?: AbortSignal): Promise<DemoRecord> { return record; }
export async function cacheReadyRecords(_ownerId: DemoOwnerId, records: DemoRecord[], _filter: BookFilter, _signal?: AbortSignal) { return records; }
export async function pruneCachedRecords(_ownerId: DemoOwnerId, _liveIds: string[], _signal?: AbortSignal) {}
export async function removeCachedRecord(_ownerId: DemoOwnerId, _recordId: string) {}
export async function clearRecordCache(_ownerId: DemoOwnerId) {}
export async function queueRecordDeletion(_ownerId: DemoOwnerId, _recordId: string, _baseVersion: number) {}
export async function readRecordDeletions(_ownerId: DemoOwnerId): Promise<PendingRecordDeletion[]> { return []; }
export async function removeRecordDeletion(_ownerId: DemoOwnerId, _recordId: string) {}
