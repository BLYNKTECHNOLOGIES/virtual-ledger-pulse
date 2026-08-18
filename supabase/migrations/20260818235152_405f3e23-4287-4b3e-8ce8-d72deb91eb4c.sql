drop function if exists public.execute_leave_reset(integer);

create function public.execute_leave_reset(_year integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise notice 'Leave year-end reset is disabled by company policy (no expiry, unlimited carry forward).';
end;
$$;

update public.hr_leave_types
set reset = false,
    reset_based = null,
    reset_month = null,
    reset_day = null,
    carryforward_type = 'carryforward',
    carry_forward = true,
    carryforward_expire_in = null,
    carryforward_expire_period = null
where lower(coalesce(name,'')) not like '%comp%';