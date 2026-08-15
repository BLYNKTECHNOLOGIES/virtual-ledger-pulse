CREATE OR REPLACE FUNCTION public.hr_assign_shift_schedule(
  p_employee_id uuid,
  p_shift_id uuid,
  p_effective_from date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_employee_id IS NULL OR p_shift_id IS NULL OR p_effective_from IS NULL THEN
    RAISE EXCEPTION 'employee, shift and effective_from are required';
  END IF;

  -- Remove any future/same-day rows that would overlap the new assignment
  DELETE FROM hr_employee_shift_schedule
  WHERE employee_id = p_employee_id
    AND effective_from >= p_effective_from;

  -- Close open-ended prior rows the day before the new assignment starts
  UPDATE hr_employee_shift_schedule
  SET effective_to = p_effective_from - 1,
      is_current = false
  WHERE employee_id = p_employee_id
    AND effective_from < p_effective_from
    AND (effective_to IS NULL OR effective_to >= p_effective_from);

  UPDATE hr_employee_shift_schedule
  SET is_current = false
  WHERE employee_id = p_employee_id AND is_current = true;

  INSERT INTO hr_employee_shift_schedule (employee_id, shift_id, effective_from, is_current)
  VALUES (p_employee_id, p_shift_id, p_effective_from, true)
  RETURNING id INTO v_id;

  UPDATE hr_employee_work_info SET shift_id = p_shift_id WHERE employee_id = p_employee_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_assign_shift_schedule(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_assign_shift_schedule(uuid, uuid, date) TO service_role;