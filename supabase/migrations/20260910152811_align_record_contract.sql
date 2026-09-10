-- 기존 기록·객체를 삭제하지 않는다. 저장 API와 분리된 최종 데이터 방어선이다.
create function app_private.valid_record_tags(tags text[], maximum integer)
returns boolean language sql immutable security invoker set search_path = ''
as $$
  select tags is not null
    and cardinality(tags) <= maximum
    and (cardinality(tags) = 0 or (array_ndims(tags) = 1 and array_lower(tags, 1) = 1))
    and not exists (
      select 1 from unnest(tags) as t(tag)
      where tag is null or char_length(tag) not between 1 and 24
        or tag !~ '[^[:space:]]' or tag <> normalize(tag, NFC)
    )
    and cardinality(tags) = (select count(distinct normalize(tag, NFC)) from unnest(tags) as t(tag));
$$;

create function app_private.valid_record_colors(colors jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  item jsonb;
  channel jsonb;
  rgb_hex text;
  total numeric := 0;
  weight numeric;
begin
  if colors is null or jsonb_typeof(colors) <> 'array' then return false; end if;
  if jsonb_array_length(colors) > 5 then return false; end if;
  -- uploading 예약은 빈 팔레트 허용. ready의 1~5개 요구는 기존 CHECK가 담당한다.
  if jsonb_array_length(colors) = 0 then return true; end if;
  for item in select value from jsonb_array_elements(colors) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if not (item ?& array['hex', 'rgb', 'weight'])
      or item - array['hex', 'rgb', 'weight', 'color_name_key'] <> '{}'::jsonb
      or jsonb_typeof(item->'hex') <> 'string'
      or item->>'hex' !~ '^#[0-9A-F]{6}$'
      or jsonb_typeof(item->'rgb') <> 'array'
      or jsonb_typeof(item->'weight') <> 'number' then return false; end if;
    if jsonb_array_length(item->'rgb') <> 3 then return false; end if;
    if item ? 'color_name_key' and (
      jsonb_typeof(item->'color_name_key') <> 'string'
      or char_length(item->>'color_name_key') = 0
      or item->>'color_name_key' <> normalize(item->>'color_name_key', NFC)
    ) then return false; end if;
    rgb_hex := '#';
    for channel in select value from jsonb_array_elements(item->'rgb') loop
      if jsonb_typeof(channel) <> 'number' then return false; end if;
      if (channel::text)::numeric < 0 or (channel::text)::numeric > 255
        or trunc((channel::text)::numeric) <> (channel::text)::numeric then return false; end if;
      rgb_hex := rgb_hex || upper(lpad(to_hex((channel::text)::numeric::integer), 2, '0'));
    end loop;
    if rgb_hex <> item->>'hex' then return false; end if;
    weight := (item->>'weight')::numeric;
    if weight <= 0 or weight > 1 then return false; end if;
    total := total + weight;
  end loop;
  return abs(total - 1) <= 0.001;
end;
$$;

alter table public.stamp_records
  add column ai_field_note_edited text,
  add constraint stamp_records_ai_field_note_edited_check
    check (ai_field_note_edited is null or char_length(ai_field_note_edited) <= 300),
  add constraint stamp_records_tag_items
    check (app_private.valid_record_tags(semantic_tags, 8) and app_private.valid_record_tags(mood_tags, 3)),
  add constraint stamp_records_color_items
    check (app_private.valid_record_colors(color_tags));

alter table app_private.record_tombstones enable row level security;
alter table app_private.account_deletion_jobs enable row level security;
revoke all on app_private.record_tombstones, app_private.account_deletion_jobs from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant select, insert, update, delete on app_private.record_tombstones, app_private.account_deletion_jobs to service_role;

-- JWT의 UID만 조회한다. 호출자에게 삭제 작업이나 Auth 행 자체를 공개하지 않는다.
create function app_private.current_account_is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (select 1 from auth.users where id = (select auth.uid()))
    and not exists (select 1 from app_private.account_deletion_jobs where user_id = (select auth.uid()));
$$;

revoke all on function app_private.valid_record_tags(text[], integer),
  app_private.valid_record_colors(jsonb), app_private.current_account_is_active() from public, anon, authenticated;
grant execute on function app_private.valid_record_tags(text[], integer),
  app_private.valid_record_colors(jsonb) to service_role;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_account_is_active() to authenticated;

alter table public.stamp_records enable row level security;
revoke all on public.stamp_records from public, anon, authenticated;
grant select on public.stamp_records to authenticated;
alter policy "owners read their records" on public.stamp_records
  using ((select auth.uid()) = user_id and (select app_private.current_account_is_active()));

-- Storage 정책의 Record EXISTS도 위 RLS를 거치므로 탈퇴 잠금을 함께 적용한다.
-- private/PNG/5MiB 및 uploading INSERT·ready SELECT만 허용하는 기존 정책을 유지한다.
