-- AM-SEC-5b / AM-SEC-3b / AM-SEC-2b: close the gaps left by the earlier work.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. Helper: who may manage Terminal users (same rights the Terminal Users list uses).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.terminal_can_manage_users(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_perms text[];
begin
  if p_user_id is null then return false; end if;
  if public.has_role(p_user_id, 'Super Admin') then return true; end if;
  if exists (select 1 from public.p2p_terminal_user_roles ur
             join public.p2p_terminal_roles r on r.id = ur.role_id
             where ur.user_id = p_user_id and r.hierarchy_level <= 0) then return true; end if;
  v_perms := array(select rp.permission::text from public.p2p_terminal_user_roles ur
                   join public.p2p_terminal_role_permissions rp on rp.role_id = ur.role_id
                   where ur.user_id = p_user_id);
  return v_perms && array['terminal_users_manage','terminal_users_manage_all','terminal_users_manage_subordinates'];
end $$;
revoke all on function public.terminal_can_manage_users(uuid) from public, anon;
grant execute on function public.terminal_can_manage_users(uuid) to authenticated, service_role;

-- Super Admin or terminal admin (hierarchy_level <= 0). Used to gate account rows
-- and self-mapping.
create or replace function public.terminal_is_admin(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id is null then return false; end if;
  if public.has_role(p_user_id, 'Super Admin') then return true; end if;
  return exists (select 1 from public.p2p_terminal_user_roles ur
                 join public.p2p_terminal_roles r on r.id = ur.role_id
                 where ur.user_id = p_user_id and r.hierarchy_level <= 0);
end $$;
revoke all on function public.terminal_is_admin(uuid) from public, anon;
grant execute on function public.terminal_is_admin(uuid) to authenticated, service_role;

-- Which of these text user_ids have Ads Toggle or Manage. Used by the rest end
-- to ignore a hand-change row from someone who can't actually switch an ad.
create or replace function public.users_with_ads_toggle(p_user_ids text[])
returns text[] language sql stable security definer set search_path = public as $$
  with ids as (
    select distinct u::uuid as uid from unnest(coalesce(p_user_ids, '{}'::text[])) u
    where u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select array_agg(distinct uid::text) from ids
   where public.has_role(uid, 'Super Admin')
      or exists (select 1 from public.p2p_terminal_user_roles ur
                 join public.p2p_terminal_roles r on r.id = ur.role_id
                 where ur.user_id = uid and r.hierarchy_level <= 0)
      or exists (select 1 from public.p2p_terminal_user_roles ur
                 join public.p2p_terminal_role_permissions rp on rp.role_id = ur.role_id
                 where ur.user_id = uid
                   and rp.permission::text in ('terminal_ads_toggle','terminal_ads_manage'));
$$;
revoke all on function public.users_with_ads_toggle(text[]) from public, anon;
grant execute on function public.users_with_ads_toggle(text[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. terminal_user_exchange_mappings — writes limited to user-managers;
--    self-mapping limited to admins.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists terminal_write on public.terminal_user_exchange_mappings;
create policy terminal_mappings_insert on public.terminal_user_exchange_mappings
  for insert to authenticated
  with check (
    public.terminal_can_manage_users(auth.uid())
    and (user_id <> auth.uid() or public.terminal_is_admin(auth.uid()))
  );
create policy terminal_mappings_update on public.terminal_user_exchange_mappings
  for update to authenticated
  using (public.terminal_can_manage_users(auth.uid()))
  with check (public.terminal_can_manage_users(auth.uid())
              and (user_id <> auth.uid() or public.terminal_is_admin(auth.uid())));
create policy terminal_mappings_delete on public.terminal_user_exchange_mappings
  for delete to authenticated
  using (public.terminal_can_manage_users(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. terminal_exchange_accounts — admin-only writes; credential_key / is_default
--    are server-only (column grants + guard trigger).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists terminal_write on public.terminal_exchange_accounts;
create policy terminal_accounts_insert on public.terminal_exchange_accounts
  for insert to authenticated with check (public.terminal_is_admin(auth.uid()));
create policy terminal_accounts_update on public.terminal_exchange_accounts
  for update to authenticated
  using (public.terminal_is_admin(auth.uid()))
  with check (public.terminal_is_admin(auth.uid()));
create policy terminal_accounts_delete on public.terminal_exchange_accounts
  for delete to authenticated
  using (public.terminal_is_admin(auth.uid()));

revoke update on public.terminal_exchange_accounts from authenticated;
grant update (account_name, account_identifier, exchange_platform, is_active,
              color, display_order, p2p_advertiser_no, ad_uptime_tracked)
  on public.terminal_exchange_accounts to authenticated;
revoke insert on public.terminal_exchange_accounts from authenticated;
grant insert (account_name, account_identifier, exchange_platform, is_active,
              color, display_order, p2p_advertiser_no, ad_uptime_tracked)
  on public.terminal_exchange_accounts to authenticated;

create or replace function public.terminal_exchange_accounts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_service boolean := coalesce(auth.jwt() ->> 'role','') = 'service_role' or auth.uid() is null;
begin
  if v_is_service then return new; end if;
  if tg_op = 'INSERT' then
    new.credential_key := null;   -- server-only
    new.is_default     := false;  -- server-only
  elsif tg_op = 'UPDATE' then
    if new.credential_key is distinct from old.credential_key then
      raise exception 'credential_key is server-only' using errcode = '42501';
    end if;
    if new.is_default is distinct from old.is_default then
      raise exception 'is_default is server-only' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists terminal_exchange_accounts_guard on public.terminal_exchange_accounts;
create trigger terminal_exchange_accounts_guard
  before insert or update on public.terminal_exchange_accounts
  for each row execute function public.terminal_exchange_accounts_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Default-access trigger — map a brand-new user to every account only once;
--    a later role assignment never re-maps a restricted user.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_terminal_default_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.terminal_user_exchange_mappings where user_id = new.user_id) then
    insert into public.terminal_user_exchange_mappings (user_id, exchange_account_id)
    select new.user_id, ea.id from public.terminal_exchange_accounts ea
    on conflict (user_id, exchange_account_id) do nothing;
  end if;

  insert into public.terminal_user_size_range_mappings (user_id, size_range_id)
  select new.user_id, sr.id from public.terminal_order_size_ranges sr
  where sr.is_active = true
  on conflict (user_id, size_range_id) do nothing;

  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ad_action_logs — browser callers may only insert their own rows; the
--    server-owned rest events (ad.rest_*) are rejected from the browser;
--    no one but the service role may update or delete.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists authenticated_all_ad_action_logs on public.ad_action_logs;
create policy ad_action_logs_select on public.ad_action_logs
  for select to authenticated using (public.verify_terminal_access(auth.uid()));
create policy ad_action_logs_insert_own on public.ad_action_logs
  for insert to authenticated
  with check (
    auth.uid() is not null
    and user_id = auth.uid()::text
    and action_type not like 'ad.rest\_%' escape '\'
  );
-- (no UPDATE / DELETE policy for authenticated — service_all_ad_action_logs still covers service_role)
