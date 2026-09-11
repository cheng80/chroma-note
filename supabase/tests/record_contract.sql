-- SQL Editor/MCP/psql에서 전체 실행. 모든 fixture와 변경은 ROLLBACK된다.
begin;

do $$
declare
  invalid jsonb;
  invalid_tags text[];
  owner uuid := gen_random_uuid();
  intruder uuid := gen_random_uuid();
  record_id uuid := gen_random_uuid();
  result jsonb;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.stamp_records'::regclass), 'Record RLS 비활성';
  assert (select relrowsecurity from pg_class where oid = 'app_private.record_tombstones'::regclass), 'tombstone RLS 비활성';
  assert (select relrowsecurity from pg_class where oid = 'app_private.account_deletion_jobs'::regclass), '탈퇴 작업 RLS 비활성';
  assert has_table_privilege('authenticated', 'public.stamp_records', 'select'), 'authenticated SELECT grant 누락';
  assert not has_table_privilege('authenticated', 'public.stamp_records', 'insert'), 'authenticated INSERT 노출';
  assert not has_table_privilege('authenticated', 'public.stamp_records', 'update'), 'authenticated UPDATE 노출';
  assert not has_table_privilege('authenticated', 'public.stamp_records', 'delete'), 'authenticated DELETE 노출';
  assert not has_table_privilege('anon', 'public.stamp_records', 'select'), 'anon SELECT 노출';
  assert has_schema_privilege('authenticated', 'app_private', 'usage'), 'RLS helper schema USAGE 누락';
  assert not has_schema_privilege('anon', 'app_private', 'usage'), 'anon 내부 schema 노출';
  assert not has_table_privilege('authenticated', 'app_private.record_tombstones', 'select'), '내부 tombstone 노출';
  assert has_function_privilege('service_role', 'public.record_lifecycle_transaction(text,uuid,uuid,uuid,uuid,text,jsonb,integer)', 'execute'), 'lifecycle RPC service_role grant 누락';
  assert not has_function_privilege('authenticated', 'public.record_lifecycle_transaction(text,uuid,uuid,uuid,uuid,text,jsonb,integer)', 'execute'), 'lifecycle RPC authenticated 노출';
  assert not has_function_privilege('anon', 'public.record_lifecycle_admin(text,uuid,uuid)', 'execute'), 'admin RPC anon 노출';
  assert not has_function_privilege('authenticated', 'app_private.record_lifecycle_actual(text,uuid,uuid,uuid,uuid,text,jsonb,integer)', 'execute'), '내부 lifecycle 함수 노출';
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.prosecdef
      and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ), 'SECURITY DEFINER search_path 고정 누락';
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('record_lifecycle_transaction', 'record_lifecycle_admin')
      and (p.prosecdef or not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""'])
  ), '공개 wrapper 권한 또는 search_path 오류';
  assert to_regclass('public.stamp_records_cleanup_idx') is not null, '정리 조회 인덱스 누락';
  assert exists (
    select 1 from cron.job
    where jobname = 'record-lifecycle-cleanup'
      and schedule = '*/15 * * * *' and active
      and command like '%record_lifecycle_cleanup_secret%'
      and command like '%"action":"cleanup","limit":10%'
  ), '15분 cleanup Cron 누락';
  assert exists (
    select 1 from vault.secrets
    where name = 'record_lifecycle_cleanup_secret'
  ), 'cleanup Vault secret 누락';
  assert exists (
    select 1 from storage.buckets
    where id = 'stamp-images' and not public and file_size_limit = 5242880
      and allowed_mime_types = array['image/png']::text[]
  ), 'private PNG bucket 계약 불일치';
  assert exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'owners download ready stamps' and cmd = 'SELECT'
      and 'authenticated'::name = any(roles)
  ), 'Storage SELECT 정책 누락';
  assert exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'owners upload reserved stamps' and cmd = 'INSERT'
      and 'authenticated'::name = any(roles)
  ), 'Storage INSERT 정책 누락';
  assert app_private.valid_record_tags('{}'::text[], 8);
  assert app_private.valid_record_tags(array['카페', '산책'], 8);
  assert app_private.valid_record_tags(array[repeat('😀',24)], 8);
  foreach invalid_tags slice 1 in array array[
    array[''], array[' '], array[null::text], array[repeat('가',25)], array[U&'\1100\1161']
  ] loop
    assert not app_private.valid_record_tags(invalid_tags, 8), '잘못된 태그 허용';
  end loop;
  assert not app_private.valid_record_tags(array['카페','카페'], 8);
  assert not app_private.valid_record_tags(array['가',U&'\1100\1161'], 8);
  assert not app_private.valid_record_tags(array['1','2','3','4'], 3);
  assert not app_private.valid_record_tags(array[['1','2'],['3','4']], 8);
  assert not app_private.valid_record_tags(null, 8);
  assert app_private.valid_record_colors('[]');
  assert app_private.valid_record_colors('[{"hex":"#0102FF","rgb":[1,2,255],"weight":1}]');
  assert app_private.valid_record_colors('[{"hex":"#000000","rgb":[0,0,0],"weight":0.4},{"hex":"#FFFFFF","rgb":[255,255,255],"weight":0.6,"color_name_key":"white"}]');
  for invalid in select value from jsonb_array_elements('[
    null, {}, [null], [1], [{}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":null}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":1,"extra":1}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":1,"color_name_key":null}],
    [{"hex":"#ffffff","rgb":[255,255,255],"weight":1}],
    [{"hex":"#000000","rgb":[0,0],"weight":1}],
    [{"hex":"#000000","rgb":[0,null,0],"weight":1}],
    [{"hex":"#000000","rgb":[0,0,0.5],"weight":1}],
    [{"hex":"#000000","rgb":[0,0,256],"weight":1}],
    [{"hex":"#000000","rgb":[0,0,-1],"weight":1}],
    [{"hex":"#000000","rgb":[0,0,1],"weight":1}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":0}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":1.1}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":0.998}],
    [{"hex":"#000000","rgb":[0,0,0],"weight":"1"}]
  ]') loop
    assert app_private.valid_record_colors(invalid) is false, '잘못된 팔레트 허용';
  end loop;
  assert not app_private.valid_record_colors(null);
  insert into auth.users(id) values(owner), (intruder);
  result := app_private.record_lifecycle_actual(
    null, owner, null, record_id, gen_random_uuid(), repeat('0', 64), '{}'::jsonb, null
  );
  assert result #>> '{error,code}' = 'validation', 'NULL action 검증 누락';
  begin
    insert into app_private.record_tombstones(user_id, record_id, operation_id, payload_hash, kind)
      values(owner, gen_random_uuid(), gen_random_uuid(), 'invalid', 'delete');
    raise exception '잘못된 tombstone hash 허용';
  exception when check_violation then null; end;
  insert into public.stamp_records(id,user_id,stamp_image_path,diary_date,date_source,creation_operation_id,creation_payload_hash)
    values(record_id,owner,owner::text||'/'||record_id::text||'/stamp.png',current_date,'user',gen_random_uuid(),'synthetic');
  update public.stamp_records set ai_field_note_edited = '' where id=record_id;
  assert (select ai_field_note_edited = '' from public.stamp_records where id=record_id);
  update public.stamp_records set ai_field_note_edited = repeat('😀',300) where id=record_id;
  begin
    update public.stamp_records set ai_field_note_edited = repeat('가',301) where id=record_id;
    raise exception '301자 메모 허용';
  exception when check_violation then null; end;
  begin
    update public.stamp_records set semantic_tags = array['중복','중복'] where id=record_id;
    raise exception '중복 태그 CHECK 누락';
  exception when check_violation then null; end;
  begin
    update public.stamp_records set color_tags = '[{"hex":"#000000","rgb":[1,0,0],"weight":1}]' where id=record_id;
    raise exception '색상 CHECK 누락';
  exception when check_violation then null; end;
  begin
    update public.stamp_records set status='ready',stamp_sha256=repeat('0',64),bytes=1,width=1,height=1 where id=record_id;
    raise exception '빈 ready 팔레트 허용';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  assert app_private.current_account_is_active();
  assert (select count(*)=1 from public.stamp_records where id=record_id);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', intruder::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',intruder,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from public.stamp_records where id=record_id), '타 계정 Record 조회 허용';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner,'role','authenticated')::text, true);
  insert into app_private.account_deletion_jobs(user_id) values(owner);
  execute 'set local role authenticated';
  assert not app_private.current_account_is_active();
  assert (select count(*)=0 from public.stamp_records where id=record_id), '탈퇴 잠금 조회 허용';
  begin
    perform 1 from app_private.account_deletion_jobs;
    raise exception '삭제 관리 테이블 노출';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert not has_function_privilege('anon','app_private.current_account_is_active()','execute');
  assert not has_function_privilege('authenticated','app_private.valid_record_tags(text[],integer)','execute');
  delete from public.stamp_records where id=record_id;
  delete from auth.users where id=owner;
  delete from app_private.account_deletion_jobs where user_id=owner;
  execute 'set local role authenticated';
  assert not app_private.current_account_is_active(), '삭제 후 기존 UID 토큰 허용';
  execute 'reset role';
end;
$$;

select 'PASS: 제약, 최소 권한, RLS, 함수 보안, Storage 정책, lifecycle 입력 검증' as result;
rollback;
