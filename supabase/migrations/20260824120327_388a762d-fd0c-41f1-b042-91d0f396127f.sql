create or replace function public.trg_terminal_default_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.terminal_user_exchange_mappings (user_id, exchange_account_id)
  select new.user_id, ea.id from public.terminal_exchange_accounts ea
  on conflict (user_id, exchange_account_id) do nothing;

  insert into public.terminal_user_size_range_mappings (user_id, size_range_id)
  select new.user_id, sr.id from public.terminal_order_size_ranges sr
  where sr.is_active = true
  on conflict (user_id, size_range_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_terminal_default_access_ins on public.p2p_terminal_user_roles;
create trigger trg_terminal_default_access_ins
after insert on public.p2p_terminal_user_roles
for each row execute function public.trg_terminal_default_access();