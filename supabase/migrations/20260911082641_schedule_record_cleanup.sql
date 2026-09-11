-- 원격 migration 이력: 20260911082641_schedule_record_cleanup
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'record-lifecycle-cleanup',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://jrtuwfateiblzkqtdbgo.supabase.co/functions/v1/record-lifecycle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-record-cleanup-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'record_lifecycle_cleanup_secret'
        )
      ),
      body := '{"action":"cleanup","limit":10}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);
