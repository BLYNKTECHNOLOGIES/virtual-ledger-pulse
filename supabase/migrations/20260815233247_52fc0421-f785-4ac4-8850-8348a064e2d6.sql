CREATE OR REPLACE FUNCTION public.hr_set_manual_day_status(
  p_employee_id uuid,
  p_date date,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.hr_is_hr_staff(v_uid) OR public.has_role(v_uid, 'admin')) THEN
    RAISE EXCEPTION 'Only HR staff can change attendance status';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('present','absent','half_day') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;

  INSERT INTO public.hr_attendance_daily
        (employee_id, attendance_date, status, manual_status, manual_status_reason,
         manual_status_by, manual_status_at, engine_version, updated_at)
  VALUES (p_employee_id, p_date, COALESCE(p_status, 'no_data'), p_status, p_reason,
          v_uid, now(), 'v4', now())
  ON CONFLICT (employee_id, attendance_date) DO UPDATE
     SET manual_status = p_status,
         manual_status_reason = p_reason,
         manual_status_by = v_uid,
         manual_status_at = now(),
         -- clearing: drop back to a neutral status so the engine can recompute freely
         status = CASE WHEN p_status IS NULL THEN 'no_data' ELSE public.hr_attendance_daily.status END,
         updated_at = now();

  IF p_status IS NULL THEN
    PERFORM public.hr_v4_recompute_range(p_employee_id, p_date, p_date);
  ELSE
    PERFORM public.hr_apply_manual_status(p_employee_id, p_date, p_date);
  END IF;

  SELECT status INTO v_new
    FROM public.hr_attendance_daily
   WHERE employee_id = p_employee_id AND attendance_date = p_date;

  INSERT INTO public.hr_attendance_intervention_log
        (employee_id, action, reason_code, notes, actor_id, payload)
  VALUES (p_employee_id,
          CASE WHEN p_status IS NULL THEN 'manual_status_cleared' ELSE 'manual_status_set' END,
          'hr_manual_override', p_reason, v_uid,
          jsonb_build_object('date', p_date, 'manual_status', p_status, 'resulting_status', v_new));

  RETURN jsonb_build_object('status', v_new, 'manual_status', p_status);
END;
$$;