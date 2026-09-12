// 전용 로컬 Supabase에서 실행. STATUS_FILE(supabase status -o json), DOCKER_HOST 필요.
// project_id=chroma-orphan-check, API=56321. 실제 DB/Auth/Storage/Edge를 사용한다.
// 오래된 시각·불일치 소유자·고아 상태만 SQL fixture로 만든다. 파일 삭제는 Storage API만 사용한다.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';

const config = JSON.parse(readFileSync(process.env.STATUS_FILE, 'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:56321');
assert.match(process.env.DOCKER_HOST ?? '', /^unix:\/\//);
const db = 'supabase_db_chroma-orphan-check';
const storageContainer = 'supabase_storage_chroma-orphan-check';
const cleanupSecret = process.env.RECORD_CLEANUP_SECRET;
assert.ok(cleanupSecret);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 });
const sqlArgs = ['exec', '-i', db, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = (input, role = 'postgres') => execFileSync('docker', sqlArgs.map((arg, i) => sqlArgs[i - 1] === '-U' ? role : arg), {
  input, encoding: 'utf8', timeout: 30000,
}).trim();
// Storage의 updated_at 자동 갱신 트리거를 fixture 시각 조작 트랜잭션에서만 우회한다.
const age = (input) => sql(`begin; set local session_replication_role=replica; ${input}; commit;`, 'supabase_admin');
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
assert.equal(sql('show cron.launch_active_jobs'), 'off', '원격 주소 Cron은 발화 전 비활성화해야 한다.');
assert.equal(sql('select count(*) from public.stamp_records'), '0', '전용 빈 검증 DB만 허용한다.');
assert.equal(sql("select count(*) from storage.objects where bucket_id='stamp-images'"), '0');

async function request(path, { body, method = 'POST', token, admin = true, headers = {} } = {}) {
  return fetch(`${config.API_URL}${path}`, {
    method, signal: AbortSignal.timeout(90000),
    headers: {
      apikey: admin ? config.SERVICE_ROLE_KEY : config.ANON_KEY,
      Authorization: `Bearer ${token ?? (admin ? config.SERVICE_ROLE_KEY : config.ANON_KEY)}`,
      'Content-Type': 'application/json', ...headers,
    },
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
  });
}
async function json(result, expected = 200) {
  const response = await result;
  assert.equal(response.status, expected, await response.clone().text());
  return response.json();
}
const cleanup = (limit, secret = cleanupSecret) => request('/functions/v1/record-lifecycle', {
  body: { action: 'cleanup', ...(limit === undefined ? {} : { limit }) },
  headers: { 'x-record-cleanup-secret': secret },
});
const claim = () => JSON.parse(sql("set role service_role; select public.record_lifecycle_admin('claim_cleanup',null,null)"));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const users = [];
const paths = [];
let paused = false;
async function createUser() {
  const email = `orphan-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('hex');
  const user = await json(request('/auth/v1/admin/users', { body: { email, password, email_confirm: true } }));
  users.push(user.id);
  const session = await json(request('/auth/v1/token?grant_type=password', { admin: false, body: { email, password } }));
  return { id: user.id, token: session.access_token, sessionId: JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url')).session_id };
}
const recordSql = (user, id) => `insert into public.stamp_records
  (id,user_id,stamp_image_path,stamp_sha256,bytes,width,height,color_tags,diary_date,date_source,creation_operation_id,creation_payload_hash)
  values (${q(id)},${q(user.id)},${q(`${user.id}/${id}/stamp.png`)},repeat('0',64),${png.length},1,1,
  '[{"hex":"#FFFFFF","rgb":[255,255,255],"weight":1}]',current_date,'user',gen_random_uuid(),repeat('0',64));`;
async function fixture(user, status = null, ageInterval = '25 hours') {
  const id = randomUUID();
  const path = `${user.id}/${id}/stamp.png`;
  sql(recordSql(user, id));
  paths.push(path);
  await json(request(`/storage/v1/object/stamp-images/${path}`, {
    admin: false, token: user.token, body: png, headers: { 'Content-Type': 'image/png' },
  }));
  assert.equal(sql(`select owner_id from storage.objects where name=${q(path)}`), user.id);
  age(`update storage.objects set created_at=now()-interval ${q(ageInterval)},updated_at=now()-interval ${q(ageInterval)} where name=${q(path)}`);
  sql(status ? `update public.stamp_records set status=${q(status)} where id=${q(id)}` : `delete from public.stamp_records where id=${q(id)}`);
  return { id, path };
}
const exists = (path) => sql(`select count(*) from storage.objects where bucket_id='stamp-images' and name=${q(path)}`) === '1';
const beginSql = (user, id, payload = {}) => `set role service_role; select public.record_lifecycle_transaction(
  'begin',${q(user.id)},${q(user.sessionId)},${q(id)},${q(randomUUID())},repeat('0',64),${q(JSON.stringify(payload))},null)`;
const begin = (user, id) => JSON.parse(sql(beginSql(user, id)));
async function resumeStorage() {
  docker('start', storageContainer);
  paused = false;
  for (let attempt = 0; ; attempt++) {
    if (docker('inspect', '-f', '{{.State.Health.Status}}', storageContainer).trim() === 'healthy') return;
    assert.ok(attempt < 60, 'Storage restart health timeout');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// 실제 별도 PostgreSQL 세션으로 잠금을 잡고 명시적으로 해제한다. 시간 추정 sleep 없음.
async function lock(statement) {
  const child = spawn('docker', sqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { output += chunk; if (output.includes('LOCKED')) resolve(); });
    child.on('exit', () => reject(new Error(errors || 'lock session exited')));
  });
  child.stdin.write(`begin; ${statement};\n\\echo LOCKED\n`);
  await ready;
  return async (statement = '') => {
    const done = once(child, 'exit');
    child.stdin.end(`${statement}; commit;\n`);
    const [code] = await done;
    assert.equal(code, 0, errors);
  };
}

try {
  const user = await createUser();
  const deletedUser = await createUser();
  for (const role of ['anon', 'authenticated']) {
    for (const name of ['public.record_lifecycle_admin', 'app_private.record_lifecycle_admin_actual']) {
      assert.equal(sql(`select has_function_privilege(${q(role)},${q(`${name}(text,uuid,uuid)`)},'execute')`), 'f');
    }
  }
  await json(cleanup(undefined, ''), 401);
  await json(cleanup(undefined, 'wrong'), 401);
  for (const limit of [0, 11, 20, 1.5]) await json(cleanup(limit), 400);
  const denied = await request('/rest/v1/rpc/record_lifecycle_admin', {
    admin: false, token: user.token, body: { p_action: 'claim_cleanup', p_user_id: null, p_record_id: null },
  });
  assert.equal(denied.status, 403);
  assert.equal(JSON.parse(sql(`select public.record_lifecycle_admin('claim_cleanup',${q(user.id)},null)`)).ok, false);

  const preserved = [await fixture(user, 'ready'), await fixture(user, 'uploading'), await fixture(user, null, '1 hour')];
  const refreshed = await fixture(user);
  sql(`update storage.objects set updated_at=now() where name=${q(refreshed.path)}`);
  preserved.push(refreshed);
  for (const change of [`owner_id=${q(deletedUser.id)}`, 'owner_id=null', `owner=${q(deletedUser.id)}`]) {
    const wrong = await fixture(user);
    age(`update storage.objects set ${change} where name=${q(wrong.path)}`);
    preserved.push(wrong);
  }
  for (const path of [`${user.id}/legacy.png`, `${user.id}/not-a-uuid/stamp.png`, `${user.id}/${randomUUID()}/other.png`]) {
    paths.push(path);
    await json(request(`/storage/v1/object/stamp-images/${path}`, { body: png, headers: { 'Content-Type': 'image/png' } }));
    age(`update storage.objects set owner_id=${q(user.id)},created_at=now()-interval '25 hours',updated_at=now()-interval '25 hours' where name=${q(path)}`);
    preserved.push({ path });
  }
  assert.deepEqual(await json(cleanup()), { cleaned: 0 });

  const orphan = await fixture(user);
  // 예약이 계정 잠금을 먼저 잡으면 cleanup은 건너뛴다. 커밋된 새 행은 보존한다.
  const unlock = await lock(beginSql(user, orphan.id, {
    stamp: { sha256: '0'.repeat(64), bytes: png.length, width: 1, height: 1 },
    semantic_tags: [], mood_tags: [], color_tags: [], user_note: '', is_favorite: false,
    diary_date: '2026-09-12', date_source: 'user', analysis_meta: {}, model_meta: {}, style_meta: {},
  }));
  try { assert.equal(claim().record, null); } finally { await unlock(); }
  assert.equal(claim().record, null);
  sql(`delete from public.stamp_records where id=${q(orphan.id)}`);
  // 후보 조회 뒤 storage 행이 갱신되는 경합: locked skip → 새 시각 재확인.
  const unlockObject = await lock(`update storage.objects set updated_at=now() where name=${q(orphan.path)}`);
  try { assert.equal(claim().record, null); } finally { await unlockObject(); }
  assert.equal(claim().record, null);
  age(`update storage.objects set updated_at=now()-interval '25 hours' where name=${q(orphan.path)}`);
  assert.equal(claim().record.id, orphan.id);
  assert.equal(begin(user, orphan.id).error.code, 'not_found');
  assert.equal(claim().record.id, orphan.id, '삭제 실패/중복 claim은 같은 객체를 재시도한다.');

  docker('stop', storageContainer);
  paused = true;
  assert.equal((await json(cleanup(1), 503)).error.code, 'cleanup_pending');
  assert.ok(exists(orphan.path));
  assert.equal(begin(user, orphan.id).error.code, 'not_found');
  await resumeStorage();
  assert.deepEqual(await json(cleanup(1)), { cleaned: 1 });
  assert.ok(!exists(orphan.path));
  const missing = await request(`/storage/v1/object/stamp-images/${orphan.path}`, { method: 'GET' });
  assert.ok([400, 404].includes(missing.status));
  assert.equal(begin(user, orphan.id).error.code, 'not_found');

  // 삭제된 사용자: FK 오류 없이 삭제 가능하고 lifecycle 재생성은 인증에서 거부한다.
  const abandoned = await fixture(deletedUser);
  const unlockUser = await lock("set role service_role; select public.record_lifecycle_admin('claim_cleanup',null,null)");
  try {
    assert.throws(() => sql(`set lock_timeout='100ms'; delete from auth.users where id=${q(deletedUser.id)}`), /lock timeout/);
  } finally { await unlockUser(); }
  sql(`delete from auth.users where id=${q(deletedUser.id)}`);
  assert.equal(claim().record.id, abandoned.id);
  assert.equal(begin(deletedUser, abandoned.id).error.code, 'unauthorized');
  assert.deepEqual(await json(cleanup(1)), { cleaned: 1 });
  assert.ok(!exists(abandoned.path));

  const expired = await fixture(user, 'uploading');
  sql(`update public.stamp_records set updated_at=now()-interval '25 hours' where id=${q(expired.id)}`);
  assert.deepEqual(await json(cleanup(1)), { cleaned: 1 });
  assert.equal(begin(user, expired.id).error.code, 'not_found');
  assert.ok(!exists(expired.path));
  const deleting = await fixture(user, 'deleting');
  assert.deepEqual(await json(cleanup(1)), { cleaned: 1 });
  assert.equal(begin(user, deleting.id).error.code, 'not_found');

  const batch = [];
  for (let i = 0; i < 11; i++) batch.push(await fixture(user));
  assert.deepEqual(await json(cleanup()), { cleaned: 10 });
  assert.equal(batch.filter(({ path }) => exists(path)).length, 1);
  assert.deepEqual(await json(cleanup()), { cleaned: 1 });
  assert.deepEqual(await json(cleanup()), { cleaned: 0 });
  for (const { path } of preserved) assert.ok(exists(path), `보존 대상: ${path}`);
  assert.equal(sql('select count(*) from cron.job_run_details'), '0');
  console.log('PASS actual DB/Auth/Storage/Edge: orphan filters, permissions, locks/recheck, tombstones, deleted-user FK, Storage failure/retry, max10 batch, normal records preserved');
} finally {
  if (paused) await resumeStorage();
  if (paths.length) await json(request('/storage/v1/object/stamp-images', { method: 'DELETE', body: { prefixes: paths } }));
  for (const id of users) sql(`delete from public.stamp_records where user_id=${q(id)}; delete from auth.users where id=${q(id)}`);
}
