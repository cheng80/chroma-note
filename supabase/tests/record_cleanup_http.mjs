// 로컬 Supabase에서만 실행: SERVER_SUPABASE_URL, SERVER_SUPABASE_SECRET_KEY,
// EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, CLEANUP_STATE_FILE가 필요하다.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const secret = process.env.SERVER_SUPABASE_SECRET_KEY;
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const stateFile = process.env.CLEANUP_STATE_FILE;
const rawBase = process.env.SERVER_SUPABASE_URL;
assert.ok(rawBase && secret && publicKey && stateFile, '로컬 검증 환경값이 필요하다.');
const localUrl = new URL(rawBase);
assert.ok(
  localUrl.protocol === 'http:' &&
    ['127.0.0.1', '[::1]', 'localhost'].includes(localUrl.hostname) &&
    !localUrl.username && !localUrl.password && localUrl.pathname === '/' &&
    !localUrl.search && !localUrl.hash,
  'SERVER_SUPABASE_URL은 경로·자격증명·query 없는 loopback HTTP URL이어야 한다.',
);
const base = localUrl.origin;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const request = (path, { method = 'GET', body, token, admin = false, contentType } = {}) => fetch(new URL(path, base), {
  method,
  signal: AbortSignal.timeout(30000),
  headers: {
    apikey: admin ? secret : publicKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'Content-Type': contentType ?? 'application/json' }),
  },
  body: body === undefined ? undefined : contentType ? body : JSON.stringify(body),
});
const json = async (response, expected, label) => {
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${label}: HTTP ${response.status}`);
  return body;
};

function saveState(state) {
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  chmodSync(stateFile, 0o600);
}

function removeState() {
  try { unlinkSync(stateFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function cleanup(state) {
  if (state.path) {
    const result = await request('/storage/v1/object/stamp-images', { admin: true, method: 'DELETE', body: { prefixes: [state.path] } });
    assert.ok(result.ok || result.status === 404, `합성 PNG 정리: HTTP ${result.status}`);
  }
  if (state.recordId) {
    const result = await request(`/rest/v1/stamp_records?id=eq.${state.recordId}`, { admin: true, method: 'DELETE' });
    assert.ok(result.ok || result.status === 404, `합성 Record 정리: HTTP ${result.status}`);
  }
  if (state.userId) {
    const result = await request(`/auth/v1/admin/users/${state.userId}`, { admin: true, method: 'DELETE' });
    assert.ok(result.ok || result.status === 404, `합성 계정 정리: HTTP ${result.status}`);
  }
}

function beginBody(recordId, operationId) {
  const payload = {
    diary_date: '2026-09-12', date_source: 'user', place_name: null, user_note: 'cleanup 검증',
    scene: '검증 장면', semantic_tags: ['검증'], mood_tags: ['차분함'], ai_field_note: '',
    ai_field_note_edited: null, is_favorite: false,
    color_tags: [{ hex: '#FFFFFF', rgb: [255, 255, 255], weight: 1 }],
    analysis_meta: { schema_version: 1, status: 'success', ai_scene: '검증 장면', ai_tags: ['검증'], ai_mood: ['차분함'], language: 'ko', user_modified_fields: [] },
    model_meta: { source_revision: 1, vlm: { model_id: 'cleanup-test' }, line: { model_id: 'cleanup-test', revision: 'test', runtime_version: 'test', quantization: 'none', inference_duration_ms: 0 } },
    style_meta: { style_id: 'ink-v1', line_model_style: 'style1', max_edge: 1024, mask_gain: 1, background: 'white', postprocess_version: 'test', input_dimensions: [1, 1], output_dimensions: [1, 1], fit: 'contain' },
    stamp: { sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length, width: 1, height: 1 },
  };
  return { action: 'begin', record_id: recordId, operation_id: operationId, payload_hash: hash(payload), payload };
}

const phase = process.argv[2];
if (phase === 'setup') {
  const email = `chroma-cleanup-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const state = {};
  try {
    const user = await json(await request('/auth/v1/admin/users', { admin: true, method: 'POST', body: { email, password, email_confirm: true } }), 200, '합성 계정 생성');
    state.userId = user.id;
    saveState(state);
    const session = await json(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 200, '합성 세션 생성');
    state.token = session.access_token;
    const recordId = randomUUID();
    const operationId = randomUUID();
    const begin = beginBody(recordId, operationId);
    const reserved = await json(await request('/functions/v1/record-lifecycle', { method: 'POST', token: state.token, body: begin }), 200, '정리 대상 예약');
    Object.assign(state, { recordId, path: reserved.record.stamp_image_path });
    saveState(state);
    await json(await request(`/storage/v1/object/stamp-images/${state.path}`, { method: 'POST', token: state.token, body: png, contentType: 'image/png' }), 200, '정리 대상 PNG 업로드');
    const finalized = await json(await request('/functions/v1/record-lifecycle', { method: 'POST', token: state.token, body: { action: 'finalize', record_id: recordId, operation_id: operationId, payload_hash: begin.payload_hash, payload: {} } }), 200, '정리 대상 finalize');
    state.deletion = { action: 'delete', record_id: recordId, operation_id: randomUUID(), payload_hash: hash({}), payload: {}, base_version: finalized.record.version };
    saveState(state);
    console.log(`READY ${recordId}`);
  } catch (error) {
    try { await cleanup(state); removeState(); } catch { saveState(state); }
    throw error;
  }
} else {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (phase === 'delete') {
    const expected = Number(process.env.EXPECTED_DELETE_STATUS);
    const result = await request('/functions/v1/record-lifecycle', { method: 'POST', token: state.token, body: state.deletion });
    const body = await result.json().catch(() => ({}));
    assert.equal(result.status, expected, `delete: HTTP ${result.status}`);
    if (expected !== 200) assert.equal(body.error?.code, 'cleanup_pending');
    console.log(`DELETE ${result.status} ${state.recordId}`);
  } else if (phase === 'verify') {
    try {
      const rows = await json(await request(`/rest/v1/stamp_records?id=eq.${state.recordId}&select=id`, { admin: true }), 200, '정리 후 행 조회');
      assert.deepEqual(rows, []);
      const object = await request(`/storage/v1/object/stamp-images/${state.path}`, { admin: true });
      assert.ok([400, 404].includes(object.status), `정리 후 객체 조회: HTTP ${object.status}`);
      const deletedUser = await request(`/auth/v1/admin/users/${state.userId}`, { admin: true, method: 'DELETE' });
      assert.equal(deletedUser.status, 200, `합성 계정 정리: HTTP ${deletedUser.status}`);
      state.userId = null;
      console.log(`PASS ${state.recordId}`);
    } finally {
      await cleanup(state);
      removeState();
    }
  } else throw new Error('phase must be setup, delete, or verify');
}
