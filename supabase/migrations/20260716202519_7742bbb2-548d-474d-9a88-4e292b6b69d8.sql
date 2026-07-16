-- Canonical: 'System Operator' (Title case, matches RazorpayX convention)
-- Duplicate:  'System operator' (lowercase 'o') — has 7 work_info + 7 onboarding refs

DO $$
DECLARE
  v_canonical uuid := '4b42721f-f5c5-4062-abfc-06ffe10eb679';  -- 'System Operator'
  v_dupe      uuid := 'cdd7a6ea-0dd5-4b2a-b170-3968e272c426';  -- 'System operator'
BEGIN
  -- Only run if both still exist (idempotent)
  IF EXISTS (SELECT 1 FROM public.positions WHERE id = v_canonical)
     AND EXISTS (SELECT 1 FROM public.positions WHERE id = v_dupe) THEN

    UPDATE public.hr_employee_work_info
       SET job_position_id = v_canonical
     WHERE job_position_id = v_dupe;

    UPDATE public.hr_employee_onboarding
       SET position_id = v_canonical
     WHERE position_id = v_dupe;

    -- Safety: repoint any other schema-verified position_id/job_position_id columns
    UPDATE public.hr_recruitments      SET position_id     = v_canonical WHERE position_id     = v_dupe;
    UPDATE public.hr_candidates        SET job_position_id = v_canonical WHERE job_position_id = v_dupe;
    UPDATE public.hr_leave_accrual_plans SET position_id   = v_canonical WHERE position_id     = v_dupe;
    UPDATE public.employees            SET position_id     = v_canonical WHERE position_id     = v_dupe;
    UPDATE public.users                SET position_id     = v_canonical WHERE position_id     = v_dupe;

    -- Deactivate rather than delete — preserves any historical FK we didn't enumerate
    UPDATE public.positions
       SET is_active = false,
           title = title || ' (merged)',
           updated_at = now()
     WHERE id = v_dupe;
  END IF;
END$$;

-- Safeguard: prevent future case-only duplicates among ACTIVE positions.
-- Uses lower(btrim(title)) — matches the resolver in razorpay-payroll-proxy.
CREATE UNIQUE INDEX IF NOT EXISTS positions_active_title_ci_uniq
  ON public.positions (lower(btrim(title)))
  WHERE is_active = true;