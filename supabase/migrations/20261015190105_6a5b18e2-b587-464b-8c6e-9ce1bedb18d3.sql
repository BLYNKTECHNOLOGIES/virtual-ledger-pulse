
create or replace function public.ad_action_logs_stamp_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- AM-SEC-5c: a browser cannot choose its own created_at. Server-written rows
  -- (service role, or SQL run without a user context) keep whatever they set.
  if auth.uid() is not null
     and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    new.created_at := now();
  end if;
  return new;
end
$$;
