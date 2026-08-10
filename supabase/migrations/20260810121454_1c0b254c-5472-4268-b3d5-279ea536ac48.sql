-- 1. New columns
ALTER TABLE public.hr_attendance_regularization_requests
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'ess',
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_status text,
  ADD COLUMN IF NOT EXISTS manager_remarks text,
  ADD COLUMN IF NOT EXISTS manager_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_decided_by uuid,
  ADD COLUMN IF NOT EXISTS pushed_to_manager_at timestamptz,
  ADD COLUMN IF NOT EXISTS pushed_by uuid;

-- 2. Status vocabulary
ALTER TABLE public.hr_attendance_regularization_requests
  DROP CONSTRAINT IF EXISTS hr_attendance_regularization_requests_status_check;
ALTER TABLE public.hr_attendance_regularization_requests
  ADD CONSTRAINT hr_attendance_regularization_requests_status_check
  CHECK (status = ANY (ARRAY['pending','manager_review','manager_reviewed','approved','rejected','cancelled']));

ALTER TABLE public.hr_attendance_regularization_requests
  DROP CONSTRAINT IF EXISTS hr_reg_manager_status_ck;
ALTER TABLE public.hr_attendance_regularization_requests
  ADD CONSTRAINT hr_reg_manager_status_ck
  CHECK (manager_status IS NULL OR manager_status = ANY (ARRAY['pending','approved','rejected']));

ALTER TABLE public.hr_attendance_regularization_requests
  DROP CONSTRAINT IF EXISTS hr_reg_reason_category_ck;
ALTER TABLE public.hr_attendance_regularization_requests
  ADD CONSTRAINT hr_reg_reason_category_ck
  CHECK (reason_category IS NULL OR reason_category = ANY (ARRAY['missed_punch','device_offline','wrong_shift_mapped','approved_offsite','other_documented']));

CREATE INDEX IF NOT EXISTS idx_hr_reg_manager_id ON public.hr_attendance_regularization_requests(manager_id) WHERE manager_id IS NOT NULL;

-- 3. Routing / stamping trigger
CREATE OR REPLACE FUNCTION public.hr_reg_manager_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HR pushes to the reporting manager
  IF NEW.status = 'manager_review' AND COALESCE(OLD.status,'') <> 'manager_review' THEN
    IF NEW.manager_id IS NULL THEN
      SELECT reporting_manager_id INTO NEW.manager_id
      FROM public.hr_employees WHERE id = NEW.employee_id;
    END IF;
    IF NEW.manager_id IS NULL THEN
      RAISE EXCEPTION 'No reporting manager set for this employee — cannot push the request forward';
    END IF;
    NEW.manager_status := 'pending';
    NEW.pushed_to_manager_at := COALESCE(NEW.pushed_to_manager_at, now());
    NEW.pushed_by := COALESCE(NEW.pushed_by, auth.uid());
  END IF;

  -- Manager records a decision → back to HR
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

DROP TRIGGER IF EXISTS trg_hr_reg_manager_routing ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_hr_reg_manager_routing
  BEFORE UPDATE ON public.hr_attendance_regularization_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_reg_manager_routing();

-- 4. Manager access
GRANT SELECT, INSERT, UPDATE ON public.hr_attendance_regularization_requests TO authenticated;
GRANT ALL ON public.hr_attendance_regularization_requests TO service_role;

DROP POLICY IF EXISTS "Manager view routed regularization" ON public.hr_attendance_regularization_requests;
CREATE POLICY "Manager view routed regularization"
  ON public.hr_attendance_regularization_requests
  FOR SELECT TO authenticated
  USING (manager_id IS NOT NULL AND manager_id = public.hr_current_employee_id());

DROP POLICY IF EXISTS "Manager decide routed regularization" ON public.hr_attendance_regularization_requests;
CREATE POLICY "Manager decide routed regularization"
  ON public.hr_attendance_regularization_requests
  FOR UPDATE TO authenticated
  USING (manager_id IS NOT NULL
         AND manager_id = public.hr_current_employee_id()
         AND status = 'manager_review')
  WITH CHECK (manager_id = public.hr_current_employee_id()
              AND status IN ('manager_review','manager_reviewed'));

-- 5. Existing pending rows keep the same meaning ('pending' = awaiting HR)
