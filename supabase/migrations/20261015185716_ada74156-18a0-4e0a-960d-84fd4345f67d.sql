
-- AM-SEC-5c · security tightenings on top of 5b

-- 1. Mapping writes: subordinates-only for non-admins; no self edits except admins.
create or replace function public.terminal_may_manage_target(p_manager uuid, p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_perms text[];
begin
  if p_manager is null or p_target is null then return false; end if;
  -- Admins (Super Admin, Terminal admin, manage_all): any target, including themselves.
  if public.terminal_is_admin(p_manager) then return true; end if;
  v_perms := array(select rp.permission::text from public.p2p_terminal_user_roles ur
                   join public.p2p_terminal_role_permissions rp on rp.role_id = ur.role_id
                   where ur.user_id = p_manager);
  if 'terminal_users_manage_all' = any(v_perms) then
    return true;
  end if;
  -- Non-admin: never themselves, and only their own subordinates.
  if p_target = p_manager then return false; end if;
  if not (v_perms && array['terminal_users_manage','terminal_users_manage_subordinates']) then
    return false;
  end if;
  return exists (
    select 1 from public.get_terminal_subordinates(p_manager) s where s.user_id = p_target
  );
end
$$;

revoke all on function public.terminal_may_manage_target(uuid, uuid) from public, anon;
grant execute on function public.terminal_may_manage_target(uuid, uuid) to authenticated, service_role;

drop policy if exists terminal_mappings_insert on public.terminal_user_exchange_mappings;
drop policy if exists terminal_mappings_update on public.terminal_user_exchange_mappings;
drop policy if exists terminal_mappings_delete on public.terminal_user_exchange_mappings;

create policy terminal_mappings_insert on public.terminal_user_exchange_mappings
  for insert to authenticated
  with check (public.terminal_may_manage_target(auth.uid(), user_id));

create policy terminal_mappings_update on public.terminal_user_exchange_mappings
  for update to authenticated
  using (public.terminal_may_manage_target(auth.uid(), user_id))
  with check (public.terminal_may_manage_target(auth.uid(), user_id));

create policy terminal_mappings_delete on public.terminal_user_exchange_mappings
  for delete to authenticated
  using (public.terminal_may_manage_target(auth.uid(), user_id));

-- 2. ad_action_logs: server-stamped created_at for signed-in inserts.
create or replace function public.ad_action_logs_stamp_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    new.created_at := now();
  end if;
  return new;
end
$$;

revoke all on function public.ad_action_logs_stamp_time() from public, anon, authenticated;

drop trigger if exists trg_ad_action_logs_stamp_time on public.ad_action_logs;
create trigger trg_ad_action_logs_stamp_time
  before insert on public.ad_action_logs
  for each row execute function public.ad_action_logs_stamp_time();

-- 3. users_with_ads_toggle: server-only; no signed-in caller learns who holds the right.
revoke execute on function public.users_with_ads_toggle(text[]) from public, anon, authenticated;
grant execute on function public.users_with_ads_toggle(text[]) to service_role;

-- 4. Bulk variant of binance_accounts_for_user — server-only, used by the rest end
--    to narrow hand-change rows to ads whose account the author may use.
create or replace function public.users_binance_accounts(p_user_ids text[])
returns table(user_id text, account_ids uuid[])
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select distinct u::uuid as uid from unnest(coalesce(p_user_ids, '{}'::text[])) u
    where u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select ids.uid::text, coalesce(public.binance_accounts_for_user(ids.uid), '{}'::uuid[])
  from ids;
$$;

revoke all on function public.users_binance_accounts(text[]) from public, anon, authenticated;
grant execute on function public.users_binance_accounts(text[]) to service_role;
