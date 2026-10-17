ALTER TABLE public.positions VALIDATE CONSTRAINT positions_company_grade_check;
CREATE OR REPLACE FUNCTION public.ds1_login_follow_employee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_active THEN
  UPDATE public.hr_employee_work_info SET job_position_id=job_position_id WHERE employee_id=NEW.id;
  UPDATE public.users u SET department_id=w.department_id,position_id=w.job_position_id FROM public.hr_employees e LEFT JOIN public.hr_employee_work_info w ON w.employee_id=e.id WHERE e.id=NEW.id AND u.id=NEW.user_id AND (u.department_id IS DISTINCT FROM w.department_id OR u.position_id IS DISTINCT FROM w.job_position_id);
 END IF;
 RETURN NULL;
END $$;