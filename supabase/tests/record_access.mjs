// 실행: node supabase/tests/record_access.mjs
// 개발 프로젝트에서 합성 계정 2개·1px PNG만 사용하며 finally에서 정리한다.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';

const env = parseEnv(readFileSync(new URL('../../docs/supabase/.env.server', import.meta.url), 'utf8'));
const base = env.SERVER_SUPABASE_URL?.replace(/\/$/, '');
const secret = env.SERVER_SUPABASE_SECRET_KEY;
assert.equal(base, 'https://jrtuwfateiblzkqtdbgo.supabase.co', '개발 프로젝트만 검증한다.');
assert.ok(secret, '서버 전용 로컬 키가 필요하다.');
const publicEnv = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
const publicKey = publicEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey, '앱 공개 키가 필요하다.');
const users = [];
const records = [];
const paths = new Set();
const checks = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=', 'base64');

async function request(path, { method = 'GET', body, token, admin = false, contentType, headers = {} } = {}) {
  return fetch(base + path, {
    method, signal: AbortSignal.timeout(30000), headers: {
      apikey: admin ? secret : publicKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': contentType ?? 'application/json' }),
      ...headers,
    }, body: body === undefined ? undefined : contentType ? body : JSON.stringify(body),
  });
}
async function ok(response, label) {
  assert.ok(response.ok, `${label}: HTTP ${response.status}`);
  checks.push(label);
  return response;
}
async function denied(response, label) {
  assert.ok([400, 401, 403, 404].includes(response.status), `${label}: HTTP ${response.status}`);
  checks.push(label);
}
async function rows(user) {
  const response = await ok(await request('/rest/v1/stamp_records?select=id', { token: user.token }), '본인 기록 조회');
  return response.json();
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `chroma-rls-${randomUUID()}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    const created = await ok(await request('/auth/v1/admin/users', {
      admin: true, method: 'POST', body: { email, password, email_confirm: true },
    }), '합성 계정 생성');
    const user = await created.json();
    users.push(user);
    const session = await ok(await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password },
    }), '합성 계정 세션');
    user.token = (await session.json()).access_token;
    const id = randomUUID();
    const record = {
      id, user_id: user.id, stamp_image_path: `${user.id}/${id}/stamp.png`,
      diary_date: '2026-09-11', date_source: 'user', creation_operation_id: randomUUID(),
      creation_payload_hash: 'synthetic-access-check', semantic_tags: ['검증'],
      ai_field_note: '검증용 원문', ai_field_note_edited: '',
    };
    records.push(record);
    await ok(await request('/rest/v1/stamp_records', { admin: true, method: 'POST', body: record }), '예약 행 생성');
  }
  const [a, b] = users;
  const [ra, rb] = records;
  assert.deepEqual((await rows(a)).map(r => r.id), [ra.id]);
  assert.deepEqual((await rows(b)).map(r => r.id), [rb.id]);
  checks.push('A/B DB 격리');
  await denied(await request('/rest/v1/stamp_records?select=id'), '미인증 DB 조회 차단');
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    await denied(await request(`/rest/v1/stamp_records?id=eq.${ra.id}`, {
      method, token: a.token, ...(method === 'DELETE' ? {} : { body: method === 'POST' ? ra : { user_note: '직접 수정' } }),
    }), `클라이언트 ${method} 차단`);
  }
  const upload = (path, token, type = 'image/png', bytes = png, upsert = false) => {
    // 차단 검증이 실패하거나 응답이 유실돼도 생성됐을 수 있는 합성 파일을 정리한다.
    paths.add(path);
    return request(`/storage/v1/object/stamp-images/${path}`, {
      method: 'POST', token, body: bytes, contentType: type, headers: { 'x-upsert': String(upsert) },
    });
  };
  await denied(await upload(ra.stamp_image_path, b.token), '타 계정 업로드 차단');
  await denied(await upload(`${a.id}/${randomUUID()}/stamp.png`, a.token), '예약 없는 업로드 차단');
  await denied(await upload(`${a.id}/${ra.id}/original.png`, a.token), '예약 외 파일 경로 차단');
  await denied(await upload(ra.stamp_image_path, undefined), '미인증 업로드 차단');
  await denied(await upload(ra.stamp_image_path, a.token, 'image/jpeg'), 'PNG 외 MIME 차단');
  const oversized = await upload(ra.stamp_image_path, a.token, 'image/png', Buffer.alloc(5242881));
  assert.ok([400, 413].includes(oversized.status), `5MiB 초과 차단: HTTP ${oversized.status}`);
  checks.push('5MiB 초과 차단');
  await ok(await upload(ra.stamp_image_path, a.token), '본인 예약 PNG 업로드');
  const download = token => request(`/storage/v1/object/authenticated/stamp-images/${ra.stamp_image_path}`, { token });
  await denied(await download(a.token), '미확정 파일 조회 차단');
  await denied(await upload(ra.stamp_image_path, a.token, 'image/png', png, true), 'upsert 차단');
  await ok(await request(`/rest/v1/stamp_records?id=eq.${ra.id}`, {
    admin: true, method: 'PATCH', body: {
      status: 'ready', stamp_sha256: '0'.repeat(64), bytes: png.length, width: 1, height: 1,
      color_tags: [{ hex: '#FFFFFF', rgb: [255, 255, 255], weight: 1 }],
    },
  }), '서버 역할 ready 테스트 상태 설정');
  const own = await ok(await download(a.token), '본인 ready 파일 조회');
  assert.deepEqual(Buffer.from(await own.arrayBuffer()), png);
  await denied(await download(b.token), '타 계정 파일 조회 차단');
  await denied(await download(undefined), '미인증 파일 조회 차단');
  await denied(await request(`/storage/v1/object/public/stamp-images/${ra.stamp_image_path}`), 'public URL 조회 차단');
  await denied(await upload(ra.stamp_image_path, a.token, 'image/png', png, true), 'ready 이미지 덮어쓰기 차단');
  const deletion = await request('/storage/v1/object/stamp-images', {
    method: 'DELETE', token: a.token, body: { prefixes: [ra.stamp_image_path] },
  });
  assert.ok(deletion.ok || [400, 401, 403, 404].includes(deletion.status), `직접 파일 삭제: HTTP ${deletion.status}`);
  await ok(await download(a.token), '직접 삭제 요청 후 파일 보존');
  console.log(`PASS: ${checks.length}개 API 확인 (저장 API·OTP 검증은 아님)`);
} finally {
  const cleanupErrors = [];
  async function clean(path, options) {
    try {
      const r = await request(path, options);
      if (!r.ok && r.status !== 404) cleanupErrors.push(`HTTP ${r.status}`);
    } catch { cleanupErrors.push('network'); }
  }
  if (paths.size) await clean('/storage/v1/object/stamp-images', { admin: true, method: 'DELETE', body: { prefixes: [...paths] } });
  for (const record of records) await clean(`/rest/v1/stamp_records?id=eq.${record.id}`, { admin: true, method: 'DELETE' });
  for (const user of users) {
    if (user.token) await clean('/auth/v1/logout?scope=global', { method: 'POST', token: user.token });
    await clean(`/auth/v1/admin/users/${user.id}`, { admin: true, method: 'DELETE' });
  }
  assert.equal(cleanupErrors.length, 0, `테스트 정리 실패: ${cleanupErrors.join(', ')}`);
  console.log('PASS: 합성 계정·기록·PNG 정리');
}
