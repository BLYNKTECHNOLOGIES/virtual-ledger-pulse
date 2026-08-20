
create table if not exists public._cron_auth_probe(id bigserial primary key, req_id bigint);
insert into public._cron_auth_probe(req_id)
select net.http_post(
  url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/erp-balance-snapshot',
  headers := jsonb_build_object('Content-Type','application/json','x-scheduler-secret',(select secret_value from public.app_scheduler_secrets where name='internal_cron')),
  body := '{"snapshot_type":"SCHEDULED"}'::jsonb
);
