
-- 1. Columns for deep-pull audit
ALTER TABLE public.hr_razorpay_employee_map
  ADD COLUMN IF NOT EXISTS last_pull_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS last_pulled_at timestamptz;

-- 2. Enum value for full-pull action (safe if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'hr_razorpay_sync_action' AND e.enumlabel = 'pull_person'
  ) THEN
    ALTER TYPE public.hr_razorpay_sync_action ADD VALUE 'pull_person';
  END IF;
END$$;

-- 3. Gap-tracking view
CREATE OR REPLACE VIEW public.v_razorpay_import_gaps AS
SELECT
  m.razorpay_employee_id,
  m.hr_employee_id,
  e.badge_id,
  trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')) AS full_name,
  e.is_active,
  (e.pan_number IS NULL OR e.pan_number = '')             AS missing_pan,
  (wi.joining_date IS NULL)                                AS missing_doj,
  (wi.department_id IS NULL)                               AS missing_department,
  (wi.job_position_id IS NULL AND (wi.job_role IS NULL OR wi.job_role = '')) AS missing_designation,
  (bd.account_number IS NULL OR bd.account_number = '' OR bd.ifsc_code IS NULL OR bd.ifsc_code = '') AS missing_bank,
  m.last_pulled_at
FROM public.hr_razorpay_employee_map m
JOIN public.hr_employees e            ON e.id = m.hr_employee_id
LEFT JOIN public.hr_employee_work_info wi     ON wi.employee_id = e.id
LEFT JOIN public.hr_employee_bank_details bd  ON bd.employee_id = e.id;

GRANT SELECT ON public.v_razorpay_import_gaps TO authenticated;

-- 4. Lock the raw PII snapshot behind existing RLS. hr_razorpay_employee_map
-- already has RLS on it from earlier migrations; no changes to policies needed
-- since the new column is read only through the same authorized rows.
COMMENT ON COLUMN public.hr_razorpay_employee_map.last_pull_snapshot IS
  'Raw JSON envelope from RazorpayX people:view. Contains PII (PAN, bank, phone). Accessible only to hrms_razorpay_sync holders via existing RLS.';
