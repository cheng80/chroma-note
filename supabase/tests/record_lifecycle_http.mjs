// 실행: migration 적용 + function 배포 후 node supabase/tests/record_lifecycle_http.mjs
// 개발 프로젝트에서 합성 계정 2개·1px PNG만 사용하며 finally에서 정리한다.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const env = parseEnv(readFileSync(new URL('../../docs/supabase/.env.server', import.meta.url), 'utf8'));
const base = env.SERVER_SUPABASE_URL?.replace(/\/$/, '');
const secret = env.SERVER_SUPABASE_SECRET_KEY;
assert.equal(base, 'https://jrtuwfateiblzkqtdbgo.supabase.co', '개발 프로젝트만 검증한다.');
assert.ok(secret, '서버 전용 로컬 키가 필요하다.');
const publicEnv = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
const publicKey = publicEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey, '앱 공개 키가 필요하다.');

const users = [];
const paths = new Set();
const records = new Set();
const checks = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const pngHash = createHash('sha256').update(png).digest('hex');

async function request(path, { method = 'GET', body, token, admin = false, contentType } = {}) {
  return fetch(base + path, { method, signal: AbortSignal.timeout(30000), headers: {
    apikey: admin ? secret : publicKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'Content-Type': contentType ?? 'application/json' }),
  }, body: body === undefined ? undefined : contentType ? body : JSON.stringify(body) });
}
async function json(response, status, label) {
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, status, `${label}: HTTP ${response.status}`);
  checks.push(label);
  return body;
}
async function lifecycle(user, body, expected = 200, label = body.action) {
  return json(await request('/functions/v1/record-lifecycle', { method: 'POST', token: user?.token, body }), expected, label);
}
async function lifecycleResponse(user, body) {
  const response = await request('/functions/v1/record-lifecycle', { method: 'POST', token: user?.token, body });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
function beginBody(recordId, operationId) {
  const payload = {
    diary_date: '2026-09-11', date_source: 'user', place_name: null, user_note: '합성 검증',
    scene: '검증 장면', semantic_tags: ['검증'], mood_tags: ['차분함'], ai_field_note: '',
    ai_field_note_edited: null, is_favorite: false,
    color_tags: [{ hex: '#FFFFFF', rgb: [255, 255, 255], weight: 1 }],
    analysis_meta: { schema_version: 1, status: 'success', ai_scene: '검증 장면', ai_tags: ['검증'], ai_mood: ['차분함'], language: 'ko', user_modified_fields: [] },
    model_meta: { source_revision: 1, vlm: { model_id: 'bundled-analysis-test' }, line: { model_id: 'bundled-example', revision: 'test', runtime_version: 'test', quantization: 'none', inference_duration_ms: 0 } },
    style_meta: { style_id: 'ink-v1', line_model_style: 'style1', max_edge: 1024, mask_gain: 1.8, background: 'white', postprocess_version: 'test', input_dimensions: [1, 1], output_dimensions: [1, 1], fit: 'contain' },
    stamp: { sha256: pngHash, bytes: png.length, width: 1, height: 1 },
  };
  return { action: 'begin', record_id: recordId, operation_id: operationId, payload_hash: hash(payload), payload };
}

try {
  for (let i = 0; i < 2; i++) {
    const email = `chroma-lifecycle-${randomUUID()}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    const created = await json(await request('/auth/v1/admin/users', { admin: true, method: 'POST', body: { email, password, email_confirm: true } }), 200, '합성 계정 생성');
    const session = await json(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 200, '합성 세션 생성');
    users.push({ id: created.id, token: session.access_token, email, password });
  }
  const [owner, stranger] = users;
  const secondSession = await json(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: owner.email, password: owner.password } }), 200, '동일 소유자 두 번째 세션 생성');
  assert.notEqual(secondSession.access_token, owner.token, '서로 다른 인증 세션이 필요하다.');
  const ownerSecondSession = { token: secondSession.access_token };
  const recordId = randomUUID();
  const createOperation = randomUUID();
  const begin = beginBody(recordId, createOperation);
  records.add(recordId);
  const reserved = await lifecycle(owner, begin, 200, 'begin 예약');
  assert.equal(reserved.record.status, 'uploading');
  assert.equal(reserved.record.user_id, owner.id);
  assert.equal(reserved.record.stamp_image_path, `${owner.id}/${recordId}/stamp.png`);
  paths.add(reserved.record.stamp_image_path);
  const retried = await lifecycle(owner, begin, 200, 'begin 멱등 재시도');
  assert.deepEqual({ ...retried.record, updated_at: reserved.record.updated_at }, reserved.record);
  assert.ok(Date.parse(retried.record.updated_at) >= Date.parse(reserved.record.updated_at));
  const changedBegin = beginBody(recordId, createOperation);
  changedBegin.payload.user_note = '다른 payload';
  changedBegin.payload_hash = hash(changedBegin.payload);
  await lifecycle(owner, changedBegin, 409, '동일 create operation의 다른 payload 차단');
  const reusedOperation = beginBody(randomUUID(), createOperation);
  await lifecycle(owner, reusedOperation, 409, 'create operation의 다른 record 재사용 차단');
  const badHash = beginBody(randomUUID(), randomUUID());
  badHash.payload_hash = '0'.repeat(64);
  await lifecycle(owner, badHash, 400, 'canonical payload hash 불일치 차단');
  await lifecycle(null, beginBody(randomUUID(), randomUUID()), 401, '미인증 lifecycle 차단');
  await lifecycle(stranger, begin, 409, '타 계정 record_id 탈취 차단');

  const finalize = { action: 'finalize', record_id: recordId, operation_id: createOperation, payload_hash: begin.payload_hash, payload: {} };
  await lifecycle(owner, finalize, 422, '업로드 전 finalize 차단');
  await json(await request(`/storage/v1/object/stamp-images/${reserved.record.stamp_image_path}`, { method: 'POST', token: owner.token, body: png, contentType: 'image/png' }), 200, '예약 PNG 업로드');
  const ready = await lifecycle(owner, finalize, 200, '실물 PNG finalize');
  assert.equal(ready.record.status, 'ready');
  assert.equal(ready.record.stamp_sha256, pngHash);
  assert.deepEqual(await lifecycle(owner, finalize, 200, 'finalize 멱등 재시도'), ready);

  const editPayload = { user_note: '수정', is_favorite: true };
  const edit = { action: 'edit', record_id: recordId, operation_id: randomUUID(), payload_hash: hash(editPayload), payload: editPayload, base_version: ready.record.version };
  const edited = await lifecycle(owner, edit, 200, 'CAS edit');
  assert.equal(edited.record.version, ready.record.version + 1);
  assert.equal(edited.record.stamp_sha256, pngHash);
  assert.deepEqual(await lifecycle(owner, edit, 200, 'edit 멱등 재시도'), edited);
  await lifecycle(owner, { ...edit, operation_id: randomUUID() }, 409, '오래된 version 차단');
  const concurrentEdits = [
    { action: 'edit', record_id: recordId, operation_id: randomUUID(), payload_hash: hash({ user_note: '첫 세션 동시 수정' }), payload: { user_note: '첫 세션 동시 수정' }, base_version: edited.record.version },
    { action: 'edit', record_id: recordId, operation_id: randomUUID(), payload_hash: hash({ user_note: '두 번째 세션 동시 수정' }), payload: { user_note: '두 번째 세션 동시 수정' }, base_version: edited.record.version },
  ];
  const concurrentResults = await Promise.all([
    lifecycleResponse(owner, concurrentEdits[0]),
    lifecycleResponse(ownerSecondSession, concurrentEdits[1]),
  ]);
  assert.deepEqual(concurrentResults.map(({ status }) => status).sort(), [200, 409], '두 세션 CAS는 한 요청만 반영해야 한다.');
  const concurrentWinner = concurrentResults.find(({ status }) => status === 200).body;
  const concurrentLoser = concurrentResults.find(({ status }) => status === 409).body;
  assert.equal(concurrentWinner.record.version, edited.record.version + 1);
  assert.equal(concurrentLoser.error?.code, 'version_conflict');
  checks.push('동일 소유자 두 세션 CAS 동시 수정');
  const forbidden = { stamp: { sha256: '0'.repeat(64) } };
  await lifecycle(owner, { ...edit, operation_id: randomUUID(), payload: forbidden, payload_hash: hash(forbidden), base_version: edited.record.version }, 400, '이미지 edit 차단');

  const deletionPayload = {};
  const deletion = { action: 'delete', record_id: recordId, operation_id: randomUUID(), payload_hash: hash(deletionPayload), payload: deletionPayload, base_version: concurrentWinner.record.version };
  await lifecycle(stranger, deletion, 404, '타 계정 delete 차단');
  assert.deepEqual(await lifecycle(owner, deletion, 200, 'delete 및 객체 정리'), { record: null });
  assert.deepEqual(await lifecycle(owner, deletion, 200, 'delete tombstone 멱등 재시도'), { record: null });
  assert.deepEqual(await lifecycle(owner, { ...deletion, operation_id: randomUUID() }, 200, '이미 삭제된 record 재요청'), { record: null });
  await lifecycle(owner, begin, 404, 'tombstone 재생성 차단');
  await lifecycle(ownerSecondSession, { ...concurrentEdits[0], operation_id: randomUUID() }, 404, '삭제 후 과거 edit 차단');
  await lifecycle(ownerSecondSession, finalize, 404, '삭제 후 과거 finalize 차단');
  const rows = await json(await request(`/rest/v1/stamp_records?id=eq.${recordId}&select=id`, { token: owner.token }), 200, '삭제 후 목록 확인');
  assert.deepEqual(rows, []);

  const raceId = randomUUID();
  const raceOperation = randomUUID();
  const raceBegin = beginBody(raceId, raceOperation);
  records.add(raceId);
  const raceReserved = await lifecycle(owner, raceBegin, 200, '경합 대상 예약');
  paths.add(raceReserved.record.stamp_image_path);
  await json(await request(`/storage/v1/object/stamp-images/${raceReserved.record.stamp_image_path}`, { method: 'POST', token: owner.token, body: png, contentType: 'image/png' }), 200, '경합 대상 PNG 업로드');
  const raceFinalize = { action: 'finalize', record_id: raceId, operation_id: raceOperation, payload_hash: raceBegin.payload_hash, payload: {} };
  const raceReady = await lifecycle(owner, raceFinalize, 200, '경합 대상 finalize');
  const raceDelete = { action: 'delete', record_id: raceId, operation_id: randomUUID(), payload_hash: hash({}), payload: {}, base_version: raceReady.record.version };
  const [deleteRace, finalizeRace] = await Promise.all([
    lifecycleResponse(owner, raceDelete),
    lifecycleResponse(ownerSecondSession, raceFinalize),
  ]);
  assert.equal(deleteRace.status, 200, 'delete/finalize 경합의 삭제가 완료되어야 한다.');
  assert.ok([200, 404].includes(finalizeRace.status), 'delete/finalize 경합은 ready 응답 또는 삭제 확인으로 수렴해야 한다.');
  checks.push('delete/finalize 경합');
  await lifecycle(ownerSecondSession, raceFinalize, 404, '경합 삭제 후 과거 finalize 차단');
  await lifecycle(ownerSecondSession, { action: 'edit', record_id: raceId, operation_id: randomUUID(), payload_hash: hash({ user_note: '늦은 수정' }), payload: { user_note: '늦은 수정' }, base_version: raceReady.record.version }, 404, '경합 삭제 후 과거 edit 차단');
  const raceRows = await json(await request(`/rest/v1/stamp_records?id=eq.${raceId}&select=id`, { token: owner.token }), 200, '경합 삭제 후 목록 확인');
  assert.deepEqual(raceRows, []);

  const abortId = randomUUID();
  const abortOperation = randomUUID();
  const abortBegin = beginBody(abortId, abortOperation);
  records.add(abortId);
  await lifecycle(owner, abortBegin, 200, 'abort 대상 예약');
  const abort = { action: 'abort', record_id: abortId, operation_id: abortOperation, payload_hash: abortBegin.payload_hash, payload: {} };
  assert.deepEqual(await lifecycle(owner, abort, 200, 'uploading abort'), { record: null });
  assert.deepEqual(await lifecycle(owner, abort, 200, 'abort 멱등 재시도'), { record: null });
  await lifecycle(owner, abortBegin, 404, 'abort tombstone 재생성 차단');

  const invalidId = randomUUID();
  const invalidOperation = randomUUID();
  const invalidPng = Buffer.from(png);
  invalidPng[invalidPng.length - 5] ^= 1;
  const invalidBegin = beginBody(invalidId, invalidOperation);
  invalidBegin.payload.stamp.sha256 = createHash('sha256').update(invalidPng).digest('hex');
  invalidBegin.payload.stamp.bytes = invalidPng.length;
  invalidBegin.payload_hash = hash(invalidBegin.payload);
  records.add(invalidId);
  const invalidReserved = await lifecycle(owner, invalidBegin, 200, '손상 PNG 대상 예약');
  paths.add(invalidReserved.record.stamp_image_path);
  await json(await request(`/storage/v1/object/stamp-images/${invalidReserved.record.stamp_image_path}`, { method: 'POST', token: owner.token, body: invalidPng, contentType: 'image/png' }), 200, '손상 PNG 업로드');
  await lifecycle(owner, { action: 'finalize', record_id: invalidId, operation_id: invalidOperation, payload_hash: invalidBegin.payload_hash, payload: {} }, 422, '손상 PNG finalize 차단 및 객체 정리');
  const missingInvalid = await request(`/storage/v1/object/stamp-images/${invalidReserved.record.stamp_image_path}`, { admin: true });
  const missingBody = await missingInvalid.json().catch(() => ({}));
  assert.ok(missingInvalid.status === 404 || (missingInvalid.status === 400 && (Number(missingBody.statusCode) === 404 || missingBody.code === 'NoSuchKey')), `손상 PNG 정리: HTTP ${missingInvalid.status}`);
  const invalidAbort = { action: 'abort', record_id: invalidId, operation_id: invalidOperation, payload_hash: invalidBegin.payload_hash, payload: {} };
  assert.deepEqual(await lifecycle(owner, invalidAbort, 200, '손상 예약 abort'), { record: null });

  const oldToken = owner.token;
  const logout = await request('/auth/v1/logout?scope=global', { method: 'POST', token: oldToken });
  assert.equal(logout.status, 204, `합성 세션 해제: HTTP ${logout.status}`);
  checks.push('합성 세션 해제');
  await lifecycle({ token: oldToken }, beginBody(randomUUID(), randomUUID()), 401, '해제된 session_id 차단');
  owner.token = null;
  console.log(`PASS: ${checks.length}개 lifecycle HTTP 확인`);
} finally {
  const errors = [];
  const clean = async (path, options) => {
    try { const result = await request(path, options); if (!result.ok && result.status !== 404) errors.push(`${path}: ${result.status}`); }
    catch { errors.push(`${path}: network`); }
  };
  if (paths.size) await clean('/storage/v1/object/stamp-images', { admin: true, method: 'DELETE', body: { prefixes: [...paths] } });
  for (const id of records) await clean(`/rest/v1/stamp_records?id=eq.${id}`, { admin: true, method: 'DELETE' });
  for (const user of users) {
    if (user.token) await clean('/auth/v1/logout?scope=global', { method: 'POST', token: user.token });
    await clean(`/auth/v1/admin/users/${user.id}`, { admin: true, method: 'DELETE' });
  }
  assert.deepEqual(errors, [], `테스트 정리 실패: ${errors.join(', ')}`);
  console.log('PASS: 합성 계정·기록·PNG 정리');
}
