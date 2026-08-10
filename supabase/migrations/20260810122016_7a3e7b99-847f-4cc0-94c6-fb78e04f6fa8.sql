CREATE OR REPLACE FUNCTION public.hr_reg_manager_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'manager_review' AND COALESCE(OLD.status,'') <> 'manager_review' THEN
    IF NEW.manager_id IS NULL THEN
      SELECT wi.reporting_manager_id INTO NEW.manager_id
      FROM public.hr_employee_work_info wi
      WHERE wi.employee_id = NEW.employee_id
      LIMIT 1;
    END IF;
    IF NEW.manager_id IS NULL OR NEW.manager_id = NEW.employee_id THEN
      RAISE EXCEPTION 'No reporting manager set for this employee — cannot push the request forward';
    END IF;
    NEW.manager_status := 'pending';
    NEW.pushed_to_manager_at := COALESCE(NEW.pushed_to_manager_at, now());
    NEW.pushed_by := COALESCE(NEW.pushed_by, auth.uid());
  END IF;

  IF NEW.manager_status IS DISTINCT FROM OLD.manager_status
     AND NEW.manager_status IN ('approved','rejected') THEN
    NEW.manager_decided_at := COALESCE(NEW.manager_decided_at, now());
    NEW.manager_decided_by := COALESCE(NEW.manager_decided_by, auth.uid());
    IF NEW.status = 'manager_review' THEN
      NEW.status := 'manager_reviewed';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
