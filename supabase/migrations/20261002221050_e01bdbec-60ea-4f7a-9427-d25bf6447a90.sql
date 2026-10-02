-- 1) Weekly-off / holiday work trigger: skip fixed-pay (contract) employees
CREATE OR REPLACE FUNCTION public.hr_grant_sunday_work_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
  v_pol RECORD;
  v_dow integer;
  v_is_weekly_off boolean := false;
  v_is_holiday boolean := false;
  v_credit_type text;
  v_reason text;
BEGIN
  IF NEW.status NOT IN ('present', 'late', 'half_day') THEN
    RETURN NEW;
  END IF;

  -- Fixed-pay (contract) employees: attendance never affects pay, so no comp-off.
  IF EXISTS (
    SELECT 1 FROM public.hr_employee_work_info w
    WHERE w.employee_id = NEW.employee_id AND w.employee_type = 'contract'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(NEW.employee_id);

  -- Patterns that treat every day as a working day never earn comp-off.
  IF v_pol.no_compoff THEN
    RETURN NEW;
  END IF;

  v_dow := extract(dow from NEW.attendance_date)::integer;
  v_is_weekly_off := v_dow = ANY(v_pol.off_days);

  IF NOT v_pol.holidays_working THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hr_holidays h
      WHERE h.date = NEW.attendance_date AND h.is_active = true
    ) INTO v_is_holiday;
  END IF;

  IF NOT v_is_weekly_off AND NOT v_is_holiday THEN
    RETURN NEW;
  END IF;

  v_credit_type := CASE WHEN v_is_holiday THEN 'holiday' ELSE 'sunday_work' END;
  v_reason := CASE
    WHEN v_is_holiday AND v_is_weekly_off THEN 'Auto-granted: worked on company holiday and weekly-off day'
    WHEN v_is_holiday THEN 'Auto-granted: worked on company holiday'
    ELSE 'Auto-granted: worked on weekly-off day (' || to_char(NEW.attendance_date, 'Dy') || ', ' || NEW.status || ')'
  END;

  INSERT INTO public.hr_compoff_credits (
    employee_id, credit_date, credit_type, credit_days, is_allocated, notes
  ) VALUES (
    NEW.employee_id, NEW.attendance_date, v_credit_type, 1, false, v_reason
  )
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.hr_sunday_credit_audit (
      employee_id, attendance_date, attendance_status, outcome, reason,
      trigger_op, compoff_credit_id
    ) VALUES (
      NEW.employee_id, NEW.attendance_date, NEW.status,
      'granted', v_reason, TG_OP, v_inserted_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Holiday reconciliation: same exclusion for fixed-pay (contract) employees
CREATE OR REPLACE FUNCTION public.hr_reconcile_holiday_date(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cleared int := 0;
  v_credited int := 0;
BEGIN
  IF p_date IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

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

  INSERT INTO public.hr_compoff_credits (employee_id, credit_date, credit_type, credit_days, is_allocated, notes)
  SELECT d.employee_id, p_date, 'holiday', 1, false, 'Auto-granted: worked on company holiday'
    FROM public.hr_attendance_daily d
   WHERE d.attendance_date = p_date
     AND d.status IN ('present', 'late', 'half_day')
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_employee_work_info w
       WHERE w.employee_id = d.employee_id AND w.employee_type = 'contract'
     )
  ON CONFLICT (employee_id, credit_date) WHERE notes LIKE 'Auto-granted:%' DO NOTHING;
  GET DIAGNOSTICS v_credited = ROW_COUNT;

  RETURN jsonb_build_object('date', p_date, 'absent_cleared', v_cleared, 'compoff_credited', v_credited);
END;
$function$;

-- 3) Remove Vicky Sahare's September comp-off (never pushed to RazorpayX)
DELETE FROM public.hr_payroll_input_additions
 WHERE id = '9d6c18d4-ad0d-4ff5-8565-34a27b4bcd59' AND pushed_at IS NULL;

DELETE FROM public.hr_compoff_settlements
 WHERE id = '86bddd25-6816-415f-ac79-bb6c14a72701';

DELETE FROM public.hr_compoff_credits
 WHERE id = 'ee6d3c62-0662-4e14-9e0c-6861beb8e535';