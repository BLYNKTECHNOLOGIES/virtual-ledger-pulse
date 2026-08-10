CREATE OR REPLACE FUNCTION public.compute_leave_clashes()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_dept_id uuid;
  v_clash_count INTEGER;
BEGIN
  SELECT department_id INTO v_dept_id
  FROM public.hr_employee_work_info
  WHERE employee_id = NEW.employee_id
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    NEW.leave_clashes_count := 0;
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT lr.employee_id)
  INTO v_clash_count
  FROM public.hr_leave_requests lr
  JOIN public.hr_employee_work_info wi ON wi.employee_id = lr.employee_id
  WHERE wi.department_id = v_dept_id
    AND lr.employee_id != NEW.employee_id
    AND lr.id != NEW.id
    AND lr.status IN ('approved', 'requested', 'manager_approved')
    AND lr.start_date <= NEW.end_date
    AND lr.end_date >= NEW.start_date;

  NEW.leave_clashes_count := v_clash_count;
  RETURN NEW;
END;
$function$;