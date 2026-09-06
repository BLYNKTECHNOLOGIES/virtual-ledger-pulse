-- 1. De-duplicate holidays and enforce one row per date
DELETE FROM public.hr_holidays h
USING public.hr_holidays k
WHERE h.date = k.date
  AND (h.created_at, h.id) > (k.created_at, k.id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_holidays_date ON public.hr_holidays (date);

-- 2. Retro-reconciliation of a (possibly back-dated) holiday
CREATE OR REPLACE FUNCTION public.hr_reconcile_holiday_date(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared int := 0;
  v_credited int := 0;
BEGIN
  IF p_date IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

  -- Absent rows on a holiday are not absence: neutralise them (calendars overlay
  -- the declared holiday) so the LOP engine can never charge that day.
  UPDATE public.hr_attendance_daily d
     SET status = 'no_data',
         flags = COALESCE(d.flags, '{}'::jsonb)
                 || jsonb_build_object('holiday_reclassified_at', now(), 'holiday_date', p_date)
   WHERE d.attendance_date = p_date
     AND d.status = 'absent';
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  DELETE FROM public.hr_attendance a
   WHERE a.attendance_date = p_date
     AND a.attendance_status = 'absent';

  -- Anyone who actually worked that day earns a comp-off credit.
  INSERT INTO public.hr_compoff_credits (employee_id, credit_date, credit_type, credit_days, is_allocated, notes)
  SELECT d.employee_id, p_date, 'holiday', 1, false, 'Auto-granted: worked on company holiday'
    FROM public.hr_attendance_daily d
   WHERE d.attendance_date = p_date
     AND d.status IN ('present', 'late', 'half_day')
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING;
  GET DIAGNOSTICS v_credited = ROW_COUNT;

  RETURN jsonb_build_object('date', p_date, 'absent_cleared', v_cleared, 'compoff_credited', v_credited);
END;
$$;

-- 3. Withdraw auto holiday credits when a holiday is removed/deactivated
CREATE OR REPLACE FUNCTION public.hr_withdraw_holiday_credits(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_removed int := 0;
BEGIN
  DELETE FROM public.hr_compoff_credits c
   WHERE c.credit_date = p_date
     AND c.credit_type = 'holiday'
     AND c.notes LIKE 'Auto-granted:%'
     AND c.settled_period_month IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_holidays h
        WHERE h.is_active = true AND h.date = p_date
     );
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN jsonb_build_object('date', p_date, 'credits_removed', v_removed);
END;
$$;

-- 4. Trigger holiday reconciliation on holiday create/update/delete
CREATE OR REPLACE FUNCTION public.hr_holiday_change_reconcile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.hr_withdraw_holiday_credits(OLD.date);
    RETURN OLD;
  END IF;

  IF NEW.is_active = true AND NEW.date <= v_today THEN
    PERFORM public.hr_reconcile_holiday_date(NEW.date);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.date IS DISTINCT FROM NEW.date THEN
      PERFORM public.hr_withdraw_holiday_credits(OLD.date);
    END IF;
    IF NEW.is_active = false THEN
      PERFORM public.hr_withdraw_holiday_credits(NEW.date);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_holiday_change_reconcile ON public.hr_holidays;
CREATE TRIGGER trg_hr_holiday_change_reconcile
AFTER INSERT OR UPDATE OR DELETE ON public.hr_holidays
FOR EACH ROW EXECUTE FUNCTION public.hr_holiday_change_reconcile();

-- 5. Never store an absent row on a declared holiday
CREATE OR REPLACE FUNCTION public.hr_block_absent_on_weekly_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offs int[];
  v_status text;
  v_date date;
BEGIN
  IF TG_TABLE_NAME = 'hr_attendance' THEN
    v_status := NEW.attendance_status; v_date := NEW.attendance_date;
  ELSE
    v_status := NEW.status; v_date := NEW.attendance_date;
  END IF;

  IF v_status IS DISTINCT FROM 'absent' OR v_date IS NULL OR NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.hr_is_holiday(v_date) THEN
    IF TG_TABLE_NAME = 'hr_attendance' THEN
      RETURN NULL;
    ELSE
      NEW.status := 'no_data';
      RETURN NEW;
    END IF;
  END IF;

  v_offs := public.fn_employee_weekly_off_dows(NEW.employee_id, v_date);
  IF v_offs IS NOT NULL AND EXTRACT(DOW FROM v_date)::int = ANY(v_offs) THEN
    IF TG_TABLE_NAME = 'hr_attendance' THEN
      RETURN NULL;
    ELSE
      NEW.status := 'no_data';
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Backfill every already-declared past holiday (incl. 4 Sep Janmashtami)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT date FROM public.hr_holidays
            WHERE is_active = true AND date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  LOOP
    PERFORM public.hr_reconcile_holiday_date(r.date);
  END LOOP;
END $$;
