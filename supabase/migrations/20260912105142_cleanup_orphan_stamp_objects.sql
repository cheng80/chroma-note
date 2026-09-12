-- 기존 claim → Storage API DELETE → purge 흐름에 정규 경로의 오래된 고아만 포함한다.
-- storage.objects는 조회/잠금만 한다. 메타데이터를 SQL로 삭제하지 않는다.
create or replace function app_private.record_lifecycle_admin_actual(
  p_action text,
  p_user_id uuid,
  p_record_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate record;
  cleanup_record public.stamp_records%rowtype;
  orphan_object storage.objects%rowtype;
  orphan_user_id uuid;
  orphan_record_id uuid;
begin
  if p_action = 'purge_record' then
    if p_user_id is null or p_record_id is null then return jsonb_build_object('ok', false); end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
    delete from public.stamp_records where id = p_record_id and user_id = p_user_id and status = 'deleting';
    return jsonb_build_object('ok', true, 'deleted', true);
  end if;

  if p_action = 'claim_cleanup' then
    if p_user_id is not null or p_record_id is not null then return jsonb_build_object('ok', false); end if;
    -- lifecycle과 동일한 잠금 순서: 계정 → 행. 갱신된 예약은 재확인 후 보존한다.
    for candidate in
      select id, user_id from public.stamp_records
      where status = 'deleting'
        or (status = 'uploading' and updated_at < now() - interval '24 hours')
      order by status, updated_at, id
    loop
      if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text, 0)) then continue; end if;
      select * into cleanup_record from public.stamp_records
      where id = candidate.id and user_id = candidate.user_id
        and (status = 'deleting' or (status = 'uploading' and updated_at < now() - interval '24 hours'))
      for update skip locked;
      if not found then continue; end if;
      insert into app_private.record_tombstones(user_id, record_id, operation_id, payload_hash, kind)
      values (cleanup_record.user_id, cleanup_record.id, cleanup_record.creation_operation_id,
        cleanup_record.creation_payload_hash, 'abort')
      on conflict (user_id, record_id) do nothing;
      if cleanup_record.status = 'uploading' then
        update public.stamp_records
          set status = 'deleting', deletion_requested_at = now(), updated_at = now()
          where id = cleanup_record.id returning * into cleanup_record;
      end if;
      return jsonb_build_object('ok', true, 'record', to_jsonb(cleanup_record));
    end loop;

    for candidate in
      select o.id, o.name from storage.objects o
      where o.bucket_id = 'stamp-images'
        and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/stamp[.]png$'
        and o.owner_id = split_part(o.name, '/', 1)
        and (o.owner is null or o.owner::text = o.owner_id)
        and o.created_at < now() - interval '24 hours'
        and o.updated_at < now() - interval '24 hours'
        and not exists (select 1 from public.stamp_records r where r.stamp_image_path = o.name)
      order by o.updated_at, o.id
    loop
      orphan_user_id := split_part(candidate.name, '/', 1)::uuid;
      orphan_record_id := split_part(candidate.name, '/', 2)::uuid;
      if not pg_try_advisory_xact_lock(hashtextextended(orphan_user_id::text, 0)) then continue; end if;
      select * into orphan_object from storage.objects o
      where o.id = candidate.id and o.bucket_id = 'stamp-images' and o.name = candidate.name
        and o.owner_id = orphan_user_id::text
        and (o.owner is null or o.owner = orphan_user_id)
        and o.created_at < now() - interval '24 hours'
        and o.updated_at < now() - interval '24 hours'
      for update skip locked;
      if not found then continue; end if;
      if exists (select 1 from public.stamp_records where id = orphan_record_id) then continue; end if;

      -- Auth 삭제와 FK 삽입을 직렬화한다. 이미 삭제된 계정은 lifecycle 자체가 거부한다.
      perform 1 from auth.users where id = orphan_user_id for key share;
      if found then
        insert into app_private.record_tombstones(user_id, record_id, operation_id, payload_hash, kind)
        values (orphan_user_id, orphan_record_id, gen_random_uuid(), repeat('0', 64), 'abort')
        on conflict (user_id, record_id) do nothing;
      end if;
      -- API 실패 시 객체가 남아 다음 claim에서 다시 선택된다. tombstone은 유지한다.
      return jsonb_build_object('ok', true, 'record', jsonb_build_object(
        'id', orphan_record_id, 'user_id', orphan_user_id, 'stamp_image_path', orphan_object.name
      ));
    end loop;
    return jsonb_build_object('ok', true, 'record', null);
  end if;

  return jsonb_build_object('ok', false);
end;
$$;

revoke all on function app_private.record_lifecycle_admin_actual(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.record_lifecycle_admin_actual(text, uuid, uuid) to service_role;
