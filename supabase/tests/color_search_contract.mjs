// Local only. Usage: node supabase/tests/color_search_contract.mjs [absolute path to PGlite dist/index.js]
// No network, credentials, project configuration or existing records are accessed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { COLOR_PRESETS, COLOR_SEARCH_RANGES, colorMatchWeight, matchesColorSearch, createColorSearch, rgbToOklab } from '../../src/domain/color-search.ts';
import { colorSearchBoundaryCases } from '../../src/domain/color-search.check.ts';

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
try {
  // Only Supabase-provided auth/storage surfaces are stubs; record tables,
  // validators and RLS use the actual existing migrations on real Postgres WASM.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid, bucket_id text, name text);
  `);
  await db.exec(await read('../migrations/20260910082557_initial_record_schema.sql'));
  await db.exec(await read('../migrations/20260910152811_align_record_contract.sql'));
  await db.exec(`
    insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    insert into public.stamp_records (
      id, user_id, status, stamp_image_path, stamp_sha256, bytes, width, height,
      color_tags, diary_date, date_source, creation_operation_id, creation_payload_hash,
      created_at, semantic_tags, mood_tags, is_favorite
    ) select
      lpad(to_hex(i),32,'0')::uuid,
      case when i = 97 then '00000000-0000-0000-0000-000000000002' else '00000000-0000-0000-0000-000000000001' end::uuid,
      case when i = 98 then 'uploading' when i = 99 then 'deleting' else 'ready' end,
      (case when i = 97 then '00000000-0000-0000-0000-000000000002' else '00000000-0000-0000-0000-000000000001' end)
        || '/' || lpad(to_hex(i),32,'0')::uuid::text || '/stamp.png',
      repeat('a',64), 10, 1, 1,
      case when i <= 60 then '[{"hex":"#0000FF","rgb":[0,0,255],"weight":1}]'::jsonb
        else '[{"hex":"#FF0000","rgb":[255,0,0],"weight":0.04},{"hex":"#F00000","rgb":[240,0,0],"weight":0.06},{"hex":"#0000FF","rgb":[0,0,255],"weight":0.9}]'::jsonb end,
      '2026-09-12', 'user', lpad(to_hex(i),32,'0')::uuid, 'fixture',
      '2026-09-12T00:00:00Z'::timestamptz - (i / 2) * interval '1 minute',
      array['산책'], array['차분함'], i % 2 = 0
    from generate_series(1,99) i;
  `);
  const before = (await db.query('select id, to_jsonb(r) as value from public.stamp_records r order by id')).rows;
  const policies = (await db.query("select * from pg_policies where schemaname = 'public' order by policyname")).rows;
  await db.exec(await read('../migrations/20260914014458_add_record_color_search.sql'));
  assert.deepEqual((await db.query("select id, to_jsonb(r) as value from public.stamp_records r order by id")).rows, before, 'migration preserves every original field');
  assert.deepEqual((await db.query("select * from pg_policies where schemaname = 'public' order by policyname")).rows, policies, 'RLS unchanged');

  const rgbs = [[0, 0, 0], [255, 255, 255], [10, 10, 10], [11, 11, 11], [0.04045 * 255, 0, 0]];
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) rgbs.push([r, g, b]);
  let seed = 193;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 10000; i++) rgbs.push([Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)]);
  const converted = await db.query(`select app_private.rgb_to_oklab_v1(array[
    (v->>0)::double precision,(v->>1)::double precision,(v->>2)::double precision]) as lab
    from jsonb_array_elements($1::jsonb) with ordinality as t(v,n) order by n`, [JSON.stringify(rgbs)]);
  converted.rows.forEach(({ lab }, i) => rgbToOklab(rgbs[i]).forEach((c, j) => assert.ok(Math.abs(c - lab[j]) < 1e-12, `SQL/TS RGB case ${i}`)));

  const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const cases = [...colorSearchBoundaryCases];
  for (const preset of COLOR_PRESETS) for (const { id } of COLOR_SEARCH_RANGES) for (const minWeight of [0.05, 0.1, 0.25]) {
    cases.push({ tags: [{ rgb: hexRgb(preset.hex), weight: minWeight }], search: { hex: preset.hex, range: id, minWeight }, expected: true });
  }
  cases.push({ tags: [], search: createColorSearch('#ff0000'), expected: false });
  cases.push({ tags: [{ rgb: [255,0,0], weight: 0.01 }, { rgb: [240,0,0], weight: 0.09 }], search: createColorSearch('#ff0000'), expected: true });
  for (let i = 0; i < 1000; i++) {
    const weights = Array.from({ length: 5 }, () => random());
    const total = weights.reduce((a, b) => a + b);
    const tags = weights.map((w) => ({ rgb: rgbs[Math.floor(random() * rgbs.length)], weight: w / total }));
    const target = rgbs[Math.floor(random() * rgbs.length)].map(Math.round);
    const hex = '#' + target.map((c) => c.toString(16).padStart(2, '0')).join('');
    const search = { hex, range: COLOR_SEARCH_RANGES[i % 3].id, minWeight: [0.05, 0.1, 0.25][i % 3] };
    cases.push({ tags, search, expected: matchesColorSearch(tags, search) });
  }
  const serialized = cases.map(({ tags, search }) => ({ tags, rgb: hexRgb(search.hex), radius: COLOR_SEARCH_RANGES.find(({ id }) => id === search.range).threshold, minWeight: search.minWeight }));
  const matched = await db.query(`select weight, weight >= (v->>'minWeight')::double precision - 1e-12::double precision as matches
    from jsonb_array_elements($1::jsonb) with ordinality as t(v,n)
    cross join lateral (select app_private.color_match_weight_v1(v->'tags', app_private.rgb_to_oklab_v1(array[
      (v->'rgb'->>0)::double precision,(v->'rgb'->>1)::double precision,(v->'rgb'->>2)::double precision]),
      (v->>'radius')::double precision) as weight) m order by n`, [JSON.stringify(serialized)]);
  matched.rows.forEach(({ weight, matches }, i) => {
    assert.ok(Math.abs(weight - colorMatchWeight(cases[i].tags, cases[i].search)) < 1e-12, `SQL/TS weight case ${i}`);
    assert.equal(matches, cases[i].expected, `SQL/TS predicate case ${i}`);
  });
  await db.exec(await read('./color_search_contract.sql'));
  console.log(`color_search_contract passed: ${rgbs.length} RGB conversions, ${cases.length} distance/weight cases, 99 rows preserved, RPC validation, RLS and 30+6 keyset pages`);
} finally {
  await db.close();
}
