-- Safety net: devices sometimes hold AttLog records (failed realtime push,
-- stamp windows, brief network loss). Sweep every hour by asking each device to
-- re-send today's log; the webhook dedupes on (employee, punch_time, type).
create or replace function public.hr_queue_attlog_resweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  d record;
  ist_day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
begin
  for d in select device_serial from public.hr_biometric_devices where device_serial is not null loop
    insert into public.hr_biometric_device_commands (device_serial, command_text, status)
    values (
      d.device_serial,
      'C:' || (extract(epoch from clock_timestamp())::bigint + n) ||
      ':DATA QUERY ATTLOG StartTime=' || ist_day || ' 00:00:00' || chr(9) ||
      'EndTime=' || ist_day || ' 23:59:59',
      'pending'
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.hr_queue_attlog_resweep() from public, anon, authenticated;
grant execute on function public.hr_queue_attlog_resweep() to service_role;

select cron.unschedule('hr-essl-attlog-resweep')
where exists (select 1 from cron.job where jobname = 'hr-essl-attlog-resweep');

select cron.schedule('hr-essl-attlog-resweep', '7 * * * *', $$select public.hr_queue_attlog_resweep();$$);