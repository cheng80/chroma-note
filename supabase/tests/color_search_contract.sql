-- Local only: run through color_search_contract.mjs and its isolated fixtures.
begin;
do $$
declare
  bad record;
begin
  assert not exists (select 1 from pg_attribute where attrelid = 'public.stamp_records'::regclass and attname = 'color_families'), 'obsolete classification column exists';
  assert (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('app_private','rgb_to_oklab_v1'), ('app_private','color_match_weight_v1'), ('public','search_stamp_records_by_color'))
    and not p.prosecdef and p.proconfig @> array['search_path=""']), 'invoker/search_path contract';
  assert has_function_privilege('authenticated', 'public.search_stamp_records_by_color(text,double precision,double precision)', 'execute'), 'RPC grant missing';
  assert not has_function_privilege('anon', 'public.search_stamp_records_by_color(text,double precision,double precision)', 'execute'), 'RPC exposed to anon';
  assert not has_function_privilege('anon', 'app_private.rgb_to_oklab_v1(double precision[])', 'execute'), 'helper exposed to anon';
  assert (select relrowsecurity from pg_class where oid = 'public.stamp_records'::regclass), 'RLS disabled';
  assert has_table_privilege('authenticated', 'public.stamp_records', 'select'), 'reader grant missing';
  assert not has_table_privilege('authenticated', 'public.stamp_records', 'update'), 'client write grant changed';
  assert not has_table_privilege('anon', 'public.stamp_records', 'select'), 'anon can read';
  for bad in select * from (values
    (null::text, 0.1::double precision, 0.1::double precision),
    ('#bad', 0.1, 0.1), ('#GG0000', 0.1, 0.1), ('FF0000', 0.1, 0.1), ('#FF0000 ', 0.1, 0.1),
    ('#FF0000', null, 0.1), ('#FF0000', -1, 0.1), ('#FF0000', 0.11, 0.1),
    ('#FF0000', 'NaN'::double precision, 0.1), ('#FF0000', 'Infinity'::double precision, 0.1),
    ('#FF0000', 0.1, null), ('#FF0000', 0.1, 0.2), ('#FF0000', 0.1, 0),
    ('#FF0000', 0.1, 'NaN'::double precision), ('#FF0000', 0.1, 'Infinity'::double precision)
  ) t(hex, radius, weight) loop
    begin
      perform * from public.search_stamp_records_by_color(bad.hex, bad.radius, bad.weight);
      raise exception 'invalid RPC arguments accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare
  first_page uuid[];
  next_page uuid[];
  last_row public.stamp_records;
begin
  assert (select count(*) = 0 from public.search_stamp_records_by_color('#FF0000',0.1,0.1) where user_id <> auth.uid()), 'RPC leaks another owner';
  assert (select count(*) = 36 from public.search_stamp_records_by_color('#FF0000',0.1,0.1)), 'ready color filter mismatch';
  assert (select count(*) = 0 from public.search_stamp_records_by_color('#FF0000',0.1,0.25)), 'coverage ignored';
  assert (select count(*) = 36 from public.search_stamp_records_by_color('#ff0000',0.06,0.05)), 'close radius or lowercase HEX fails';
  assert (select count(*) = 36 from public.search_stamp_records_by_color('#FF0000',0.16,0.1)), 'wide radius fails';
  -- Newest 30 records have only blue; older red matches must still be returned.
  assert (select count(*) = 0 from (select * from public.stamp_records where status = 'ready'
    order by diary_date desc, created_at desc, id desc limit 30) r
    where app_private.color_match_weight_v1(r.color_tags, app_private.rgb_to_oklab_v1(array[255,0,0]::double precision[]), 0.1) >= 0.1 - 1e-12), 'invalid pagination fixture';
  select array_agg(id order by diary_date desc, created_at desc, id desc) into first_page from (
    select * from public.search_stamp_records_by_color('#FF0000',0.1,0.1)
    order by diary_date desc, created_at desc, id desc limit 30
  ) r;
  assert cardinality(first_page) = 30, 'first filtered page is short';
  select * into last_row from public.stamp_records where id = first_page[30];
  select array_agg(id order by diary_date desc, created_at desc, id desc) into next_page from (
    select * from public.search_stamp_records_by_color('#FF0000',0.1,0.1)
      where diary_date < last_row.diary_date
        or (diary_date = last_row.diary_date and created_at < last_row.created_at)
        or (diary_date = last_row.diary_date and created_at = last_row.created_at and id < last_row.id)
    order by diary_date desc, created_at desc, id desc limit 30
  ) r;
  assert cardinality(next_page) = 6 and not first_page && next_page, 'cursor loses or duplicates matches';
  assert (select count(*) = 18 from public.search_stamp_records_by_color('#FF0000',0.1,0.1)
    where is_favorite and diary_date >= '2026-09-12' and diary_date <= '2026-09-12'
    and (semantic_tags @> array['산책'] or mood_tags @> array['산책'])), 'combined semantic filter mismatch';
  assert (select count(*) = 18 from public.search_stamp_records_by_color('#FF0000',0.1,0.1)
    where is_favorite and (semantic_tags @> array['차분함'] or mood_tags @> array['차분함'])), 'combined mood filter mismatch';
end;
$$;
reset role;
insert into app_private.account_deletion_jobs(user_id) values ('00000000-0000-0000-0000-000000000001');
set local role authenticated;
do $$ begin
  assert (select count(*) = 0 from public.search_stamp_records_by_color('#FF0000',0.1,0.1)), 'account lock bypassed';
end; $$;
set local request.jwt.claim.sub = '';
do $$ begin
  begin
    perform * from public.search_stamp_records_by_color('#FF0000',0.1,0.1);
    raise exception 'missing UID accepted';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
