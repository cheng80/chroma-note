-- 기존 analysis_meta의 AI 원본은 보존하고, Record 편집 뒤 수정 표식만 최종 필드와 다시 맞춘다.
create or replace function app_private.record_lifecycle_actual(
  p_action text,
  p_user_id uuid,
  p_session_id uuid,
  p_record_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_payload jsonb,
  p_base_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_record public.stamp_records%rowtype;
  existing_tombstone app_private.record_tombstones%rowtype;
  next_scene text;
  next_semantic_tags text[];
  next_mood_tags text[];
  next_ai_field_note_edited text;
  next_analysis_modified_fields text[];
begin
  if p_action is null or p_action not in ('begin', 'inspect', 'finalize', 'edit', 'delete', 'abort')
    or p_user_id is null or p_operation_id is null or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'validation', 'message', 'Invalid lifecycle request.'));
  end if;

  -- ponytail: 계정 단위 직렬화. 계정별 병렬 저장이 병목일 때 record_id 잠금으로 좁힌다.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unauthorized', 'message', 'The account is unavailable.'));
  end if;
  if p_session_id is null or not exists (
    select 1 from auth.sessions where id = p_session_id and user_id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unauthorized', 'message', 'The session is no longer active.'));
  end if;

  if exists (select 1 from app_private.account_deletion_jobs where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'account_locked', 'message', 'Account deletion is in progress.'));
  end if;
  if p_record_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'validation', 'message', 'record_id is required.'));
  end if;

  select * into existing_tombstone
  from app_private.record_tombstones
  where user_id = p_user_id and record_id = p_record_id;

  if p_action = 'begin' then
    if found then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'The record was deleted.'));
    end if;

    select * into current_record from public.stamp_records where id = p_record_id for update;
    if found then
      if current_record.user_id = p_user_id
        and current_record.creation_operation_id = p_operation_id
        and current_record.creation_payload_hash = p_payload_hash
        and current_record.status in ('uploading', 'ready') then
        if current_record.status = 'uploading' then
          update public.stamp_records set updated_at = now() where id = p_record_id returning * into current_record;
        end if;
        return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
      end if;
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'The record id or operation was already used.'));
    end if;

    begin
      insert into public.stamp_records(
        id, user_id, status, stamp_image_path, stamp_sha256, bytes, width, height,
        scene, semantic_tags, mood_tags, color_tags, ai_field_note, ai_field_note_edited,
        user_note, diary_date, date_source, place_name, is_favorite,
        analysis_meta, model_meta, style_meta, last_operation_id, payload_hash,
        creation_operation_id, creation_payload_hash
      ) values (
        p_record_id, p_user_id, 'uploading', p_user_id::text || '/' || p_record_id::text || '/stamp.png',
        p_payload #>> '{stamp,sha256}', (p_payload #>> '{stamp,bytes}')::bigint,
        (p_payload #>> '{stamp,width}')::integer, (p_payload #>> '{stamp,height}')::integer,
        p_payload->>'scene', array(select jsonb_array_elements_text(p_payload->'semantic_tags')),
        array(select jsonb_array_elements_text(p_payload->'mood_tags')), p_payload->'color_tags',
        p_payload->>'ai_field_note', case when p_payload->'ai_field_note_edited' = 'null'::jsonb then null else p_payload->>'ai_field_note_edited' end,
        p_payload->>'user_note', (p_payload->>'diary_date')::date, p_payload->>'date_source',
        case when p_payload->'place_name' = 'null'::jsonb then null else p_payload->>'place_name' end,
        (p_payload->>'is_favorite')::boolean, p_payload->'analysis_meta', p_payload->'model_meta',
        p_payload->'style_meta', p_operation_id, p_payload_hash, p_operation_id, p_payload_hash
      ) returning * into current_record;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'The record id or operation was already used.'));
    end;
    return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
  end if;

  select * into current_record
  from public.stamp_records
  where id = p_record_id and user_id = p_user_id
  for update;

  if p_action in ('delete', 'abort') and not found then
    if (p_action = 'delete' and existing_tombstone.kind = 'delete')
      or (existing_tombstone.operation_id = p_operation_id
      and existing_tombstone.payload_hash = p_payload_hash
      and existing_tombstone.kind = p_action) then
      return jsonb_build_object('ok', true, 'record', null, 'deleted', true);
    end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'Record not found.'));
  elsif not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'Record not found.'));
  end if;

  if p_action = 'inspect' then
    if current_record.creation_operation_id <> p_operation_id
      or current_record.creation_payload_hash <> p_payload_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'The creation operation does not match.'));
    end if;
    if current_record.status = 'deleting' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'Record not found.'));
    end if;
    return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
  end if;

  if p_action = 'finalize' then
    if current_record.creation_operation_id <> p_operation_id
      or current_record.creation_payload_hash <> p_payload_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'The creation operation does not match.'));
    end if;
    if current_record.status = 'ready' then
      return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
    end if;
    if current_record.status <> 'uploading' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'Record not found.'));
    end if;
    update public.stamp_records
      set status = 'ready', updated_at = now(), last_operation_id = p_operation_id, payload_hash = p_payload_hash
      where id = p_record_id returning * into current_record;
    return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
  end if;

  if p_action = 'edit' then
    if current_record.status <> 'ready' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'Record not found.'));
    end if;
    if current_record.last_operation_id = p_operation_id then
      if current_record.payload_hash = p_payload_hash then
        return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
      end if;
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'The operation id was reused with another payload.'));
    end if;
    if p_base_version is null or current_record.version <> p_base_version then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'version_conflict', 'message', 'The record changed on another device.', 'current_version', current_record.version
      ));
    end if;
    next_scene := case when p_payload ? 'scene' then case when p_payload->'scene' = 'null'::jsonb then null else p_payload->>'scene' end else current_record.scene end;
    next_semantic_tags := case when p_payload ? 'semantic_tags' then array(select jsonb_array_elements_text(p_payload->'semantic_tags')) else current_record.semantic_tags end;
    next_mood_tags := case when p_payload ? 'mood_tags' then array(select jsonb_array_elements_text(p_payload->'mood_tags')) else current_record.mood_tags end;
    next_ai_field_note_edited := case when p_payload ? 'ai_field_note_edited' then case when p_payload->'ai_field_note_edited' = 'null'::jsonb then null else p_payload->>'ai_field_note_edited' end else current_record.ai_field_note_edited end;
    next_analysis_modified_fields := array_remove(array[
      case
        when current_record.analysis_meta ? 'ai_scene'
          then case when next_scene is distinct from current_record.analysis_meta->>'ai_scene' then 'scene' end
        when current_record.analysis_meta->'user_modified_fields' ? 'scene' then 'scene'
      end,
      case
        when jsonb_typeof(current_record.analysis_meta->'ai_tags') = 'array'
          then case when next_semantic_tags is distinct from array(select jsonb_array_elements_text(current_record.analysis_meta->'ai_tags')) then 'semantic_tags' end
        when current_record.analysis_meta->'user_modified_fields' ? 'semantic_tags' then 'semantic_tags'
      end,
      case
        when jsonb_typeof(current_record.analysis_meta->'ai_mood') = 'array'
          then case when next_mood_tags is distinct from array(select jsonb_array_elements_text(current_record.analysis_meta->'ai_mood')) then 'mood_tags' end
        when current_record.analysis_meta->'user_modified_fields' ? 'mood_tags' then 'mood_tags'
      end,
      case when current_record.analysis_meta->'user_modified_fields' ? 'ai_field_note_edited' then 'ai_field_note_edited' end
    ], null);

    update public.stamp_records set
      diary_date = case when p_payload ? 'diary_date' then (p_payload->>'diary_date')::date else diary_date end,
      date_source = case when p_payload ? 'date_source' then p_payload->>'date_source' else date_source end,
      place_name = case when p_payload ? 'place_name' then case when p_payload->'place_name' = 'null'::jsonb then null else p_payload->>'place_name' end else place_name end,
      user_note = case when p_payload ? 'user_note' then p_payload->>'user_note' else user_note end,
      scene = next_scene,
      semantic_tags = next_semantic_tags,
      mood_tags = next_mood_tags,
      ai_field_note_edited = next_ai_field_note_edited,
      analysis_meta = jsonb_set(current_record.analysis_meta, '{user_modified_fields}', to_jsonb(next_analysis_modified_fields)),
      is_favorite = case when p_payload ? 'is_favorite' then (p_payload->>'is_favorite')::boolean else is_favorite end,
      version = version + 1, updated_at = now(), last_operation_id = p_operation_id, payload_hash = p_payload_hash
      where id = p_record_id returning * into current_record;
    return jsonb_build_object('ok', true, 'record', to_jsonb(current_record));
  end if;

  if p_action = 'delete' then
    if current_record.status = 'deleting' then
      if existing_tombstone.operation_id = p_operation_id and existing_tombstone.payload_hash = p_payload_hash
        and existing_tombstone.kind = 'delete' then
        return jsonb_build_object('ok', true, 'record', to_jsonb(current_record), 'deleted', false);
      end if;
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'Record not found.'));
    end if;
    if current_record.status <> 'ready' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'Only a ready record can be deleted.'));
    end if;
    if p_base_version is null or current_record.version <> p_base_version then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'version_conflict', 'message', 'The record changed on another device.', 'current_version', current_record.version
      ));
    end if;
  else
    if current_record.status = 'deleting' and existing_tombstone.operation_id = p_operation_id
      and existing_tombstone.payload_hash = p_payload_hash and existing_tombstone.kind = 'abort' then
      return jsonb_build_object('ok', true, 'record', to_jsonb(current_record), 'deleted', false);
    end if;
    if current_record.status <> 'uploading'
      or current_record.creation_operation_id <> p_operation_id
      or current_record.creation_payload_hash <> p_payload_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'Only the matching upload can be aborted.'));
    end if;
  end if;

  insert into app_private.record_tombstones(user_id, record_id, operation_id, payload_hash, kind)
  values (p_user_id, p_record_id, p_operation_id, p_payload_hash, p_action)
  on conflict (user_id, record_id) do nothing;
  update public.stamp_records
    set status = 'deleting', deletion_requested_at = coalesce(deletion_requested_at, now()),
        updated_at = now(), last_operation_id = p_operation_id, payload_hash = p_payload_hash,
        version = case when p_action = 'delete' then version + 1 else version end
    where id = p_record_id returning * into current_record;
  return jsonb_build_object('ok', true, 'record', to_jsonb(current_record), 'deleted', false);
end;
$$;
