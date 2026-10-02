CREATE OR REPLACE FUNCTION public.hr_guard_compoff_allocation_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_month_start date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_current_year integer := extract(year from v_month_start)::integer;
  v_current_quarter integer := ceil(extract(month from v_month_start) / 3.0)::integer;
  v_expected numeric := 0;
BEGIN
  SELECT code INTO v_code FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_code IS DISTINCT FROM 'CO' THEN
    RETURN NEW;
  END IF;

  -- Only the current quarter's CO allocation is ledger-managed. Rows for past
  -- quarters are settled snapshots that approved leave must be able to consume
  -- (e.g. a September comp-off credit used by a leave approved in October).
  IF NEW.year <> v_current_year OR NEW.quarter IS DISTINCT FROM v_current_quarter THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(c.credit_days), 0)
  INTO v_expected
  FROM public.hr_compoff_credits c
  WHERE c.employee_id = NEW.employee_id
    AND c.settled_period_month IS NULL
    AND c.credit_date >= v_month_start
    AND c.credit_date < (v_month_start + interval '1 month')::date;

  IF COALESCE(NEW.allocated_days, 0) IS DISTINCT FROM v_expected
     OR COALESCE(NEW.carry_forward_days, 0) <> 0 THEN
    RAISE EXCEPTION 'Compensatory Off is ledger-managed and cannot be allocated manually';
  END IF;

  NEW.available_days := GREATEST(v_expected - COALESCE(NEW.used_days, 0), 0);
  RETURN NEW;
END;
$$;