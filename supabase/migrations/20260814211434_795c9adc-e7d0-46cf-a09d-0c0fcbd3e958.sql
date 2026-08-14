
CREATE OR REPLACE FUNCTION public.hr_close_payroll_month(_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _first DATE := date_trunc('month', _month)::date;
  _rec RECORD;
  _blockers TEXT[] := ARRAY[]::TEXT[];
  _compoff INTEGER := 0;
BEGIN
  IF NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR _rec IN
    SELECT step_no, step_label, live_status, ack_status
    FROM public.hr_cockpit_month_state(_first)
    WHERE step_no <= 9
  LOOP
    IF _rec.ack_status IS DISTINCT FROM 'done'
       AND _rec.ack_status IS DISTINCT FROM 'skipped'
       AND _rec.live_status <> 'complete' THEN
      _blockers := array_append(_blockers, format('Step %s: %s', _rec.step_no, _rec.step_label));
    END IF;
  END LOOP;
  IF array_length(_blockers, 1) > 0 THEN
    RETURN jsonb_build_object('closed', false, 'blockers', to_jsonb(_blockers));
  END IF;

  -- Comp-off is a monthly currency: closing the month consumes every credit
  -- (taken as leave, offset against LOP or encashed) and resets the balance.
  SELECT public.hr_compoff_close_month(_first) INTO _compoff;

  PERFORM public.hr_cockpit_ack_step(_first, 10::SMALLINT, 'done', 'Month closed');
  RETURN jsonb_build_object('closed', true, 'month', _first, 'compoff_credits_settled', _compoff);
END;
$function$;

-- hr_compoff_close_month runs inside the cockpit close as the cockpit-authorised
-- caller; keep its own guard aligned with that authority model.
CREATE OR REPLACE FUNCTION public.hr_compoff_close_month(p_period_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_end date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_count integer;
  v_co_type uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.hr_is_hr_staff(auth.uid())
     AND NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT id INTO v_co_type FROM public.hr_leave_types WHERE code = 'CO' AND is_active LIMIT 1;

  UPDATE public.hr_compoff_credits c
  SET settled_period_month = date_trunc('month', p_period_month)::date,
      settlement_outcome = COALESCE(c.settlement_outcome, 'settled_in_payroll')
  WHERE c.settled_period_month IS NULL
    AND c.credit_date <= v_end;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_co_type IS NOT NULL THEN
    UPDATE public.hr_leave_allocations
    SET available_days = 0, updated_at = now()
    WHERE leave_type_id = v_co_type;
  END IF;

  RETURN v_count;
END;
$$;
