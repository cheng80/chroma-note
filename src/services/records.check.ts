import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import * as recordsCore from './records-core.ts';

const { analysisModifiedFields, canonicalJson, decodeCursor, durationMilliseconds, encodeCursor, errorCode, isGeneratedLineArtUri, RecordError, retryAfterMilliseconds, retryDelayMilliseconds, sessionIdFromAccessToken, validCreateSelection } = recordsCore;

function equal(actual: unknown, expected: unknown, message = 'unexpected value') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const cursor = { diary_date: '2026-09-11', created_at: '2026-09-11T10:20:30.000Z', id: 'abc-123' };
equal(durationMilliseconds(1174.4542083324632), 1174);
equal(durationMilliseconds(0), 0);
for (const value of [-1, NaN, Infinity]) {
  try { durationMilliseconds(value); throw new Error('invalid duration must fail'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'validation') throw error; }
}
for (const code of ['bad_jwt', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used']) {
  equal(errorCode({ name: 'AuthApiError', status: 400, code }), 'unauthorized');
}
equal(errorCode({ name: 'AuthApiError', status: 400, code: 'validation_failed' }), 'validation');
equal(errorCode({ status: 503 }), 'network');
equal(errorCode({ name: 'FunctionsFetchError', context: new TypeError('fetch failed') }), 'network');
equal(retryDelayMilliseconds(new TypeError('fetch failed'), 0), 2_000);
equal(retryDelayMilliseconds(new RecordError('network'), 0), 2_000);
equal(retryDelayMilliseconds({ status: 503 }, 1), 5_000);
equal(retryDelayMilliseconds({ status: 429, headers: new Headers({ 'Retry-After': '3' }) }, 0), 3_000);
equal(retryAfterMilliseconds({ status: 429, headers: new Headers({ 'Retry-After': '3' }) }), 3_000);
equal(retryDelayMilliseconds({ status: 429, headers: new Headers({ 'Retry-After': '60' }) }, 0), null);
equal(retryDelayMilliseconds({ status: 400 }, 0), null);
equal(retryDelayMilliseconds({ status: 503 }, 3), null);
equal(decodeCursor(encodeCursor(cursor)), cursor);
equal(canonicalJson({ z: 1, a: { b: 2, a: 3 } }), '{"a":{"a":3,"b":2},"z":1}');
try { decodeCursor('not-a-cursor'); throw new Error('invalid cursor should fail'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'validation') throw error; }
try { canonicalJson({ invalid: undefined }); throw new Error('undefined payload must fail'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'validation') throw error; }
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'demo', local_uri: 'file://other.png' }, { candidate_id: 'sample', input_revision: 1 }), false);
const lineArtUri = 'file:///app/Documents/chroma-drafts/owner-a/lineart-123e4567-e89b-42d3-a456-426614174000.png';
equal(isGeneratedLineArtUri(lineArtUri, 'owner-a', 'file:///app/Documents/'), true);
equal(isGeneratedLineArtUri(lineArtUri, 'owner-b', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///outside/chroma-drafts/owner-a/lineart-123e4567-e89b-42d3-a456-426614174000.png', 'owner-a', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///app/Documents/chroma-drafts/owner-a/nested/lineart-123e4567-e89b-42d3-a456-426614174000.png', 'owner-a', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///app/Documents/chroma-drafts/owner-a/%2e%2e/lineart-123e4567-e89b-42d3-a456-426614174000.png', 'owner-a', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///app/Documents/chroma-drafts/owner-a/original.png', 'owner-a', 'file:///app/Documents/'), false);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'device', local_uri: lineArtUri }, { candidate_id: 'sample', input_revision: 1 }), true);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'device', local_uri: 'file:///app/Documents/chroma-drafts/owner-a/original.png' }, { candidate_id: 'sample', input_revision: 1 }), false);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'device', local_uri: lineArtUri }, { candidate_id: 'other', input_revision: 1 }), false);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'demo', local_uri: 'demo-stamp' }, { candidate_id: 'sample', input_revision: 1 }), false);
equal(sessionIdFromAccessToken('header.eyJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature'), 'session-1');
try { sessionIdFromAccessToken('header.eyJzdWIiOiJvd25lciJ9.signature'); throw new Error('session id must be required'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'unauthorized') throw error; }
equal(analysisModifiedFields(
  { scene: '변경', semantic_tags: ['산책'], mood_tags: ['차분함', '따뜻함'], ai_field_note_edited: '수정문' },
  { scene: '원본', semantic_tags: ['산책'], mood: ['차분함'], ai_field_note_edited: null },
), ['scene', 'mood_tags', 'ai_field_note_edited']);

// Execute the service with the installed Supabase query/parser; only auth and fetch are local doubles.
const serviceCode = ts.transpileModule(ts.sys.readFile(decodeURIComponent(new URL('./records.ts', import.meta.url).pathname))!, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const expired = { status: 401, body: { message: 'test expired session', code: 'PGRST301' } };
const initialToken = `header.${btoa(JSON.stringify({ session_id: 'session-1' }))}.signature`;
const refreshedToken = `refreshed.${initialToken.split('.').slice(1).join('.')}`;
const row = {
  id: 'record-1', user_id: 'owner-a', status: 'ready', version: 1, stamp_image_path: 'owner-a/record-1/stamp.png',
  width: 100, height: 100, color_tags: [], created_at: cursor.created_at, diary_date: cursor.diary_date,
  date_source: 'user', place_name: null, user_note: 'preserved', scene: null, semantic_tags: [], mood_tags: [],
  ai_field_note: null, ai_field_note_edited: null, is_favorite: false,
};

function recordReads(responses: { status: number; body: unknown }[]) {
  let session = { user: { id: 'owner-a' }, access_token: initialToken, refresh_token: 'refresh-1' };
  const calls = { refresh: 0, authorization: [] as (string | null)[] };
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    refreshSession: async () => {
      calls.refresh += 1;
      session = { ...session, access_token: refreshedToken, refresh_token: 'refresh-2' };
      return { data: { session }, error: null };
    },
  };
  const fetchResponse: typeof fetch = async (input, init) => {
    equal(new URL(String(input)).pathname, '/rest/v1/stamp_records');
    equal(init?.method, 'GET');
    calls.authorization.push(new Headers(init?.headers).get('Authorization'));
    const response = responses[calls.authorization.length - 1];
    if (!response) throw new Error('unexpected extra query');
    if (response.status === 0) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(response.body), { status: response.status });
  };
  const modules: Record<string, unknown> = {
    'expo-crypto': {}, 'expo-file-system': {}, 'react-native': { AppState: { currentState: 'active' } },
    '@supabase/supabase-js': { createClient }, './records-core': recordsCore,
    './supabase': { getSupabase: () => ({ auth }) }, './network': { boundedFetch: fetchResponse },
  };
  const records = {} as Pick<typeof import('./records'), 'listRecords' | 'fetchRecord'>;
  new Function('require', 'exports', 'process', serviceCode)((id: string) => {
    if (!(id in modules)) throw new Error(`unexpected import: ${id}`);
    return modules[id];
  }, records, { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://records.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'check' } });
  return { records, calls };
}

const raw = await createClient('https://records.invalid', 'check', {
  accessToken: async () => initialToken,
  global: { fetch: async () => new Response(JSON.stringify(expired.body), { status: expired.status }) },
}).from('stamp_records').select('*');
equal(raw.status, 401);
equal(raw.error, expired.body);
equal('status' in raw.error!, false, 'PostgREST HTTP status belongs to the response, not error');

async function rejects(request: Promise<unknown>, code: recordsCore.RecordErrorCode, message: string) {
  try { await request; }
  catch (error) {
    if (error instanceof RecordError && error.code === code) return;
    throw error;
  }
  throw new Error(message);
}

for (const method of ['listRecords', 'fetchRecord'] as const) {
  const read = (records: ReturnType<typeof recordReads>['records']) => method === 'listRecords'
    ? records.listRecords('owner-a', { start_date: null, end_date: null, semantic_tag: null, favorite_only: false }) : records.fetchRecord('owner-a', row.id);
  for (const responses of [[{ status: 200, body: [row] }], [expired, { status: 200, body: [row] }]]) {
    const { records, calls } = recordReads(responses);
    const result = await read(records);
    const record = result && 'records' in result ? result.records[0] : result;
    equal(record?.id, row.id);
    equal(record?.fields.user_note, row.user_note);
    equal(calls.refresh, responses.length - 1, `${method}: refresh once only after 401`);
    equal(calls.authorization, responses.length === 1 ? [`Bearer ${initialToken}`] : [`Bearer ${initialToken}`, `Bearer ${refreshedToken}`]);
    equal(record?.stamp.image_headers?.Authorization, calls.authorization.at(-1));
  }
  const rejected = recordReads([expired, expired]);
  await rejects(read(rejected.records), 'unauthorized', `${method}: repeated 401 must reach the reauthentication boundary`);
  equal(rejected.calls.refresh, 1);
  equal(rejected.calls.authorization, [`Bearer ${initialToken}`, `Bearer ${refreshedToken}`]);

  for (const [status, code, expected] of [
    [403, '42501', 'forbidden'], [404, 'PGRST205', 'not_found'], [429, 'PGRST003', 'rate_limited'],
    [500, '', 'network'], [502, '', 'network'], [503, '', 'network'], [0, '', 'network'],
    [400, '22P02', 'validation'], [413, '', 'validation'], [409, '23505', 'conflict'],
    [406, 'PGRST116', 'not_found'], [418, '', 'unknown'],
  ] as const) {
    const { records, calls } = recordReads([{ status, body: { message: 'test query failure', code, details: '', hint: '' } }]);
    if (method === 'fetchRecord' && expected === 'not_found') equal(await read(records), null);
    else await rejects(read(records), expected, `${method}: HTTP ${status}`);
    equal(calls.refresh, 0, `${method}: HTTP ${status} must not refresh`);
    equal(calls.authorization.length, 1);
  }
  const empty = recordReads([{ status: 200, body: [] }]);
  equal(await read(empty.records), method === 'listRecords' ? { records: [], cursor: null } : null);
}
console.log('records.check passed: existing contracts and both PostgREST read paths, HTTP status, single refresh, reauthentication');

// Real SDK auth/session storage, local HTTP, and a pause before SDK refresh entry.
for (const phase of ['user', 'record', 'refresh-entry', 'refresh-inflight'] as const) {
  const transitions = phase.startsWith('refresh') ? ['owner-b'] as const : ['owner-b', 'new-session', 'signed-out', 'expired'] as const;
  for (const transition of transitions) {
    const token = (owner: string, sessionId = owner) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: owner, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.c2ln`;
    const user = (id: string) => ({ id, email: `${id}@example.invalid`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: cursor.created_at });
    let release!: () => void;
    let started!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { started = resolve; });
    let armed = false;
    let refreshes = 0;
    let queries = 0;
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fetchResponse: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/token') {
        refreshes += 1;
        equal(JSON.parse(String(init?.body)).refresh_token, phase === 'refresh-entry' ? 'refresh-replacement' : 'refresh-a');
        if (phase === 'refresh-inflight' && armed) { armed = false; started(); await delayed; }
        const refreshedOwner = phase === 'refresh-entry' ? 'owner-b' : 'owner-a';
        return respond({ access_token: token(refreshedOwner, phase === 'refresh-entry' ? 'replacement' : refreshedOwner), refresh_token: 'refresh-next', token_type: 'bearer', expires_in: 3600, user: user(refreshedOwner) });
      }
      if (path === '/auth/v1/logout') return new Response(null, { status: 204 });
      const jwt = new Headers(init?.headers).get('Authorization')?.slice(7);
      const owner = jwt ? JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub as string : '';
      const isUser = path === '/auth/v1/user';
      if (!isUser) { equal(path, '/rest/v1/stamp_records'); queries += 1; }
      if (armed && owner === 'owner-a' && isUser && phase.startsWith('refresh')) return respond(expired.body, 401);
      if (armed && owner === 'owner-a' && isUser === (phase === 'user')) {
        armed = false;
        started();
        await delayed;
        if (!isUser || transition === 'expired') return respond(expired.body, 401);
      }
      return respond(isUser ? user(owner) : []);
    };
    const client = createClient('https://records.invalid', 'check', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchResponse },
    });
    if (phase === 'refresh-entry') {
      const sdkRefresh = client.auth.refreshSession.bind(client.auth);
      client.auth.refreshSession = async (...args) => {
        if (armed) { armed = false; started(); await delayed; }
        equal(args.length, 0, 'SDK must choose its current token after the guard/refresh gap');
        return sdkRefresh(...args);
      };
    }
    const modules: Record<string, unknown> = {
      'expo-crypto': {}, 'expo-file-system': {}, 'react-native': { AppState: { currentState: 'active' } },
      '@supabase/supabase-js': { createClient }, './records-core': recordsCore,
      './supabase': { getSupabase: () => client }, './network': { boundedFetch: fetchResponse },
    };
    const records = {} as Pick<typeof import('./records'), 'listRecords'>;
    new Function('require', 'exports', 'process', serviceCode)((id: string) => {
      if (!(id in modules)) throw new Error(`unexpected import: ${id}`);
      return modules[id];
    }, records, { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://records.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'check' } });
    try {
      equal((await client.auth.setSession({ access_token: token('owner-a'), refresh_token: 'refresh-a' })).error, null);
      armed = true;
      const request = records.listRecords('owner-a', { start_date: null, end_date: null, semantic_tag: null, favorite_only: false });
      await reached;
      if (transition === 'signed-out') equal((await client.auth.signOut()).error, null);
      else if (transition !== 'expired') {
        const owner = transition === 'owner-b' ? 'owner-b' : 'owner-a';
        equal((await client.auth.setSession({ access_token: token(owner, 'replacement'), refresh_token: 'refresh-replacement' })).error, null);
      }
      const before = (await client.auth.getSession()).data.session;
      release();
      if (transition === 'expired') {
        equal(await request, { records: [], cursor: null });
        equal(refreshes, 1, `${phase}: the current session must still refresh on 401`);
      } else {
        // The installed SDK reports a discarded in-flight refresh as HTTP 409.
        await rejects(request, phase === 'refresh-inflight' ? 'conflict' : 'unauthorized', `${phase}/${transition}: stale request must stop`);
        equal(refreshes, phase.startsWith('refresh') ? 1 : 0, `${phase}/${transition}: no refresh after detecting a stale session`);
        const after = (await client.auth.getSession()).data.session;
        if (phase === 'refresh-entry') {
          equal(after?.user.id, before?.user.id, 'guard/refresh gap must preserve B');
          equal(sessionIdFromAccessToken(after!.access_token), sessionIdFromAccessToken(before!.access_token), 'guard/refresh gap must preserve the replacement session');
        } else equal(after, before, `${phase}/${transition}: preserve the active SDK session`);
        equal(queries, phase === 'record' ? 1 : 0, `${phase}/${transition}: no stale query or retry`);
      }
    } finally { release(); client.auth.stopAutoRefresh(); }
  }
}
console.log('records.check passed: real SDK delayed getUser/401, account switch, session replacement, logout, current-session refresh and guard/refresh races');
