
-- 1. Create hr_late_come_early_out table (mirrors Horilla's AttendanceLateComeEarlyOut)
CREATE TABLE IF NOT EXISTS public.hr_late_come_early_out (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.hr_attendance(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('late_come', 'early_out')),
  attendance_date DATE NOT NULL,
  late_minutes INTEGER DEFAULT 0,
  early_minutes INTEGER DEFAULT 0,
  shift_id UUID REFERENCES public.hr_shifts(id),
  penalty_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attendance_id, type)
);

CREATE INDEX idx_hr_lceo_employee_date ON public.hr_late_come_early_out(employee_id, attendance_date);
CREATE INDEX idx_hr_lceo_type_date ON public.hr_late_come_early_out(type, attendance_date);

ALTER TABLE public.hr_late_come_early_out ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage late come early out" ON public.hr_late_come_early_out FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Trigger to auto-populate hr_late_come_early_out from hr_attendance inserts/updates
CREATE OR REPLACE FUNCTION public.sync_late_come_early_out()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Handle late come
  IF COALESCE(NEW.late_minutes, 0) > 0 THEN
    INSERT INTO public.hr_late_come_early_out (attendance_id, employee_id, type, attendance_date, late_minutes, shift_id)
    VALUES (NEW.id, NEW.employee_id, 'late_come', NEW.attendance_date, NEW.late_minutes, NEW.shift_id)
    ON CONFLICT (attendance_id, type) DO UPDATE SET
      late_minutes = EXCLUDED.late_minutes,
      shift_id = EXCLUDED.shift_id;
  ELSE
    -- Remove late_come record if no longer late
    DELETE FROM public.hr_late_come_early_out WHERE attendance_id = NEW.id AND type = 'late_come';
  END IF;

  -- Handle early out
  IF COALESCE(NEW.early_leave_minutes, 0) > 0 THEN
    INSERT INTO public.hr_late_come_early_out (attendance_id, employee_id, type, attendance_date, early_minutes, shift_id)
    VALUES (NEW.id, NEW.employee_id, 'early_out', NEW.attendance_date, NEW.early_leave_minutes, NEW.shift_id)
    ON CONFLICT (attendance_id, type) DO UPDATE SET
      early_minutes = EXCLUDED.early_minutes,
      shift_id = EXCLUDED.shift_id;
  ELSE
    DELETE FROM public.hr_late_come_early_out WHERE attendance_id = NEW.id AND type = 'early_out';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_late_come_early_out ON public.hr_attendance;
CREATE TRIGGER trg_sync_late_come_early_out
  AFTER INSERT OR UPDATE ON public.hr_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_late_come_early_out();

-- 3. Add leave_clashes_count to hr_leave_requests
ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS leave_clashes_count INTEGER DEFAULT 0;

-- 4. Function to compute leave clashes for a request (same department, overlapping dates)
CREATE OR REPLACE FUNCTION public.compute_leave_clashes(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_dept_id UUID;
  v_start DATE;
  v_end DATE;
  v_clash_count INTEGER;
BEGIN
  -- Get request details
  SELECT employee_id, start_date, end_date
  INTO v_employee_id, v_start, v_end
  FROM public.hr_leave_requests WHERE id = p_request_id;

  IF v_employee_id IS NULL THEN RETURN 0; END IF;

  -- Get employee's department
  SELECT department_id INTO v_dept_id
  FROM public.hr_employee_work_info
  WHERE employee_id = v_employee_id::TEXT
  LIMIT 1;

  IF v_dept_id IS NULL THEN RETURN 0; END IF;

  -- Count overlapping approved/pending requests in same department (excluding self)
  SELECT COUNT(DISTINCT lr.employee_id)
  INTO v_clash_count
  FROM public.hr_leave_requests lr
  JOIN public.hr_employee_work_info wi ON wi.employee_id = lr.employee_id::TEXT
  WHERE wi.department_id = v_dept_id
    AND lr.id != p_request_id
    AND lr.employee_id != v_employee_id
    AND lr.status IN ('requested', 'pending', 'approved', 'Approved', 'Requested')
    AND lr.start_date <= v_end
    AND lr.end_date >= v_start;

  RETURN v_clash_count;
END;
$$;

-- 5. Trigger to auto-compute clash count on leave request insert/update
CREATE OR REPLACE FUNCTION public.update_leave_clashes_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clash_count INTEGER;
BEGIN
  -- Only compute for active requests
  IF NEW.status IN ('requested', 'pending', 'approved', 'Approved', 'Requested') THEN
    v_clash_count := public.compute_leave_clashes(NEW.id);
    NEW.leave_clashes_count := v_clash_count;
  ELSE
    NEW.leave_clashes_count := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_leave_clashes ON public.hr_leave_requests;
CREATE TRIGGER trg_update_leave_clashes
  BEFORE INSERT OR UPDATE ON public.hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_leave_clashes_on_change();

-- 6. Backfill existing hr_attendance records into hr_late_come_early_out
INSERT INTO public.hr_late_come_early_out (attendance_id, employee_id, type, attendance_date, late_minutes, shift_id)
SELECT id, employee_id, 'late_come', attendance_date, late_minutes, shift_id
FROM public.hr_attendance
WHERE COALESCE(late_minutes, 0) > 0
ON CONFLICT (attendance_id, type) DO NOTHING;

INSERT INTO public.hr_late_come_early_out (attendance_id, employee_id, type, attendance_date, early_minutes, shift_id)
SELECT id, employee_id, 'early_out', attendance_date, early_leave_minutes, shift_id
FROM public.hr_attendance
WHERE COALESCE(early_leave_minutes, 0) > 0
ON CONFLICT (attendance_id, type) DO NOTHING;
