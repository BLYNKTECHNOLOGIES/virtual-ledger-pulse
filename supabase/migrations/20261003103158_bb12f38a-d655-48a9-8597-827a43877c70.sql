REVOKE EXECUTE ON FUNCTION public.fn_enforce_leave_balance_on_apply() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_leave_available(uuid,uuid,date,date,uuid) FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.hr_my_leave_available(p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees WHERE id = p_employee_id AND user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN public.hr_leave_available(p_employee_id, p_leave_type_id, p_start, p_end, NULL);
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_my_leave_available(uuid,uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_my_leave_available(uuid,uuid,date,date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_leave_available(uuid,uuid,date,date,uuid) FROM authenticated;