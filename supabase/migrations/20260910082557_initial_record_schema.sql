create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.stamp_records (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'deleting')),
  stamp_image_path text not null unique,
  stamp_sha256 text check (stamp_sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint check (bytes between 1 and 5242880),
  width integer check (width between 1 and 4096),
  height integer check (height between 1 and 4096),
  scene text check (scene is null or char_length(scene) <= 120),
  semantic_tags text[] not null default '{}',
  mood_tags text[] not null default '{}',
  color_tags jsonb not null default '[]'::jsonb,
  ai_field_note text check (ai_field_note is null or char_length(ai_field_note) <= 300),
  user_note text not null default '' check (char_length(user_note) <= 2000),
  diary_date date not null,
  captured_at timestamptz,
  captured_offset_minutes integer check (captured_offset_minutes between -840 and 840),
  date_source text not null check (date_source in ('exif', 'device', 'user')),
  place_name text check (place_name is null or char_length(place_name) <= 120),
  is_favorite boolean not null default false,
  analysis_meta jsonb not null default '{}'::jsonb,
  model_meta jsonb not null default '{}'::jsonb,
  style_meta jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  last_operation_id uuid,
  payload_hash text,
  creation_operation_id uuid not null,
  creation_payload_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deletion_requested_at timestamptz,
  constraint stamp_records_exact_path check (
    stamp_image_path = user_id::text || '/' || id::text || '/stamp.png'
  ),
  constraint stamp_records_tag_counts check (
    cardinality(semantic_tags) <= 8 and cardinality(mood_tags) <= 3
  ),
  constraint stamp_records_color_shape check (
    jsonb_typeof(color_tags) = 'array' and jsonb_array_length(color_tags) <= 5
  ),
  constraint stamp_records_meta_shape check (
    jsonb_typeof(analysis_meta) = 'object'
    and jsonb_typeof(model_meta) = 'object'
    and jsonb_typeof(style_meta) = 'object'
    and pg_column_size(analysis_meta) + pg_column_size(model_meta) + pg_column_size(style_meta) <= 16384
  ),
  constraint stamp_records_ready_fields check (
    status <> 'ready'
    or (
      stamp_sha256 is not null and bytes is not null and width is not null and height is not null
      and jsonb_array_length(color_tags) between 1 and 5
    )
  )
);

create index stamp_records_book_idx
  on public.stamp_records (user_id, status, diary_date desc, created_at desc, id desc);

alter table public.stamp_records enable row level security;
revoke all on public.stamp_records from anon, authenticated;
grant select on public.stamp_records to authenticated;

create policy "owners read their records"
  on public.stamp_records
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table app_private.record_tombstones (
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, record_id)
);

create table app_private.account_deletion_jobs (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  status text not null default 'requested' check (status in ('requested', 'processing', 'failed', 'complete')),
  last_error text,
  attempts integer not null default 0 check (attempts >= 0)
);

revoke all on all tables in schema app_private from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stamp-images', 'stamp-images', false, 5242880, array['image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "owners download ready stamps"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'stamp-images'
    and exists (
      select 1
      from public.stamp_records record
      where record.user_id = (select auth.uid())
        and record.status = 'ready'
        and record.stamp_image_path = name
    )
  );

create policy "owners upload reserved stamps"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'stamp-images'
    and exists (
      select 1
      from public.stamp_records record
      where record.user_id = (select auth.uid())
        and record.status = 'uploading'
        and record.stamp_image_path = name
    )
  );
