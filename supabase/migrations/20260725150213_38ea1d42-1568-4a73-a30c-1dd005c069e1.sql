
-- ─────────────────────────────────────────────────────────────
-- Sunday work → +1 Casual Leave (comp-off style)
-- ─────────────────────────────────────────────────────────────

-- 1. Idempotency: at most one credit per (employee, date, type)
CREATE UNIQUE INDEX IF NOT EXISTS hr_compoff_credits_emp_date_type_uniq
  ON public.hr_compoff_credits (employee_id, credit_date, credit_type);

-- 2. When a sunday_work credit is inserted, auto-allocate into Casual Leave
CREATE OR REPLACE FUNCTION public.hr_apply_sunday_work_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cl_type_id uuid;
  v_year int := EXTRACT(YEAR FROM NEW.credit_date)::int;
  v_alloc_id uuid;
BEGIN
  IF NEW.credit_type <> 'sunday_work' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_allocated THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cl_type_id
  FROM public.hr_leave_types
  WHERE name ILIKE 'Casual Leave'
  LIMIT 1;

  IF v_cl_type_id IS NULL THEN
    RAISE NOTICE 'hr_apply_sunday_work_credit: Casual Leave type not found; credit % left un-allocated', NEW.id;
    RETURN NEW;
  END IF;

  -- Upsert allocation row for (employee, CL, year)
  SELECT id INTO v_alloc_id
  FROM public.hr_leave_allocations
  WHERE employee_id = NEW.employee_id
    AND leave_type_id = v_cl_type_id
    AND year = v_year
  LIMIT 1;

  IF v_alloc_id IS NULL THEN
    INSERT INTO public.hr_leave_allocations (
      employee_id, leave_type_id, year, allocated_days, used_days, available_days
    ) VALUES (
      NEW.employee_id, v_cl_type_id, v_year, NEW.credit_days, 0, NEW.credit_days
    )
    RETURNING id INTO v_alloc_id;
  ELSE
    UPDATE public.hr_leave_allocations
       SET allocated_days = COALESCE(allocated_days,0) + NEW.credit_days,
           available_days = COALESCE(available_days,0) + NEW.credit_days,
           updated_at = now()
     WHERE id = v_alloc_id;
  END IF;

  NEW.is_allocated := true;
  NEW.allocated_at := now();
  NEW.leave_allocation_id := v_alloc_id;
  NEW.expires_at := COALESCE(NEW.expires_at, NEW.credit_date + INTERVAL '90 days');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_apply_sunday_work_credit ON public.hr_compoff_credits;
CREATE TRIGGER trg_hr_apply_sunday_work_credit
BEFORE INSERT ON public.hr_compoff_credits
FOR EACH ROW
EXECUTE FUNCTION public.hr_apply_sunday_work_credit();

-- 3. When a Sunday attendance row is written, grant the credit
CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sunday only (DOW: 0 = Sunday)
  IF EXTRACT(DOW FROM NEW.attendance_date) <> 0 THEN
    RETURN NEW;
  END IF;

  -- Only for statuses that indicate the employee actually showed up
  IF NEW.status NOT IN ('present','late','half_day') THEN
    RETURN NEW;
  END IF;

  -- Insert (idempotent via unique index)
  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, 'sunday_work', 1, false,
    'Auto-granted: Sunday attendance (' || NEW.status || ')'
  )
  ON CONFLICT (employee_id, credit_date, credit_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_grant_sunday_work_credit ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_grant_sunday_work_credit
AFTER INSERT OR UPDATE OF status ON public.hr_attendance_daily
FOR EACH ROW
EXECUTE FUNCTION public.hr_grant_sunday_work_credit();

-- 4. If a Sunday attendance row is deleted or status flips away from present,
--    revoke the credit ONLY if it hasn't been consumed yet.
CREATE OR REPLACE FUNCTION public.hr_revoke_sunday_work_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit RECORD;
  v_used numeric;
BEGIN
  IF EXTRACT(DOW FROM OLD.attendance_date) <> 0 THEN
    RETURN OLD;
  END IF;

  -- On UPDATE, only act when status transitions AWAY from a qualifying status
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('present','late','half_day') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO v_credit
  FROM public.hr_compoff_credits
  WHERE employee_id = OLD.employee_id
    AND credit_date = OLD.attendance_date
    AND credit_type = 'sunday_work'
  LIMIT 1;

  IF v_credit.id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Guard: don't yank a credit the employee already spent
  IF v_credit.leave_allocation_id IS NOT NULL THEN
    SELECT used_days INTO v_used FROM public.hr_leave_allocations WHERE id = v_credit.leave_allocation_id;
    IF COALESCE(v_used,0) > 0 THEN
      RAISE NOTICE 'Sunday credit % already consumed (used=%); not revoked', v_credit.id, v_used;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    UPDATE public.hr_leave_allocations
       SET allocated_days = GREATEST(COALESCE(allocated_days,0) - v_credit.credit_days, 0),
           available_days = GREATEST(COALESCE(available_days,0) - v_credit.credit_days, 0),
           updated_at = now()
     WHERE id = v_credit.leave_allocation_id;
  END IF;

  DELETE FROM public.hr_compoff_credits WHERE id = v_credit.id;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_revoke_sunday_work_credit_del ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_revoke_sunday_work_credit_del
AFTER DELETE ON public.hr_attendance_daily
FOR EACH ROW
EXECUTE FUNCTION public.hr_revoke_sunday_work_credit();

DROP TRIGGER IF EXISTS trg_hr_revoke_sunday_work_credit_upd ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_revoke_sunday_work_credit_upd
AFTER UPDATE OF status ON public.hr_attendance_daily
FOR EACH ROW
WHEN (OLD.status IN ('present','late','half_day'))
EXECUTE FUNCTION public.hr_revoke_sunday_work_credit();

-- 5. Backfill: any existing Sunday attendance rows in the current year get their credit now
INSERT INTO public.hr_compoff_credits (employee_id, credit_date, credit_type, credit_days, is_allocated, notes)
SELECT d.employee_id, d.attendance_date, 'sunday_work', 1, false,
       'Backfill: Sunday attendance (' || d.status || ')'
FROM public.hr_attendance_daily d
WHERE EXTRACT(DOW FROM d.attendance_date) = 0
  AND d.status IN ('present','late','half_day')
  AND EXTRACT(YEAR FROM d.attendance_date) = EXTRACT(YEAR FROM CURRENT_DATE)
ON CONFLICT (employee_id, credit_date, credit_type) DO NOTHING;
