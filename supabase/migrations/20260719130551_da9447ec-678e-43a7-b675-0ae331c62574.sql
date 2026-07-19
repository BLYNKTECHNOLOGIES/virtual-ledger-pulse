
-- 1. Allow 'statutory_toggle' as a revision type
ALTER TABLE public.hr_salary_revisions DROP CONSTRAINT IF EXISTS hr_salary_revisions_type_check;
ALTER TABLE public.hr_salary_revisions ADD CONSTRAINT hr_salary_revisions_type_check
  CHECK (revision_type = ANY (ARRAY[
    'increment','promotion','correction','demotion',
    'bonus','performance_incentive','special_allowance','retention_bonus','ad_hoc',
    'statutory_toggle'
  ]));

-- 2. Snapshot column for the before/after enrollment state
ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS statutory_snapshot jsonb;

-- 3. Razorpay push envelope tracking for statutory endpoint (same pattern as salary)
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS push_statutory_endpoint_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_statutory_envelope_key text,
  ADD COLUMN IF NOT EXISTS push_statutory_envelope_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_statutory_envelope_verified_by uuid,
  ADD COLUMN IF NOT EXISTS push_statutory_pilot_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_statutory_pilot_hr_employee_id uuid,
  ADD COLUMN IF NOT EXISTS last_statutory_push_at timestamptz;

-- 4. RPC: apply statutory toggle, log revision, return diff for pushback
CREATE OR REPLACE FUNCTION public.apply_statutory_revision(
  p_employee_id uuid,
  p_pf_enabled boolean,
  p_esi_enabled boolean,
  p_pt_enabled boolean,
  p_effective_from date,
  p_reason text,
  p_approved_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_pf boolean;
  v_prev_esi boolean;
  v_prev_pt boolean;
  v_revision_id uuid;
  v_snapshot jsonb;
  v_status text;
BEGIN
  SELECT pf_enabled, esi_enabled, pt_enabled
    INTO v_prev_pf, v_prev_esi, v_prev_pt
  FROM public.hr_employees
  WHERE id = p_employee_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found', p_employee_id;
  END IF;

  v_snapshot := jsonb_build_object(
    'before', jsonb_build_object(
      'pf_enabled', v_prev_pf,
      'esi_enabled', v_prev_esi,
      'pt_enabled', v_prev_pt
    ),
    'after', jsonb_build_object(
      'pf_enabled', p_pf_enabled,
      'esi_enabled', p_esi_enabled,
      'pt_enabled', p_pt_enabled
    ),
    'changed', jsonb_build_object(
      'pf', v_prev_pf IS DISTINCT FROM p_pf_enabled,
      'esi', v_prev_esi IS DISTINCT FROM p_esi_enabled,
      'pt', v_prev_pt IS DISTINCT FROM p_pt_enabled
    )
  );

  v_status := CASE
    WHEN p_effective_from > CURRENT_DATE THEN 'SCHEDULED'
    WHEN (v_prev_pf IS NOT DISTINCT FROM p_pf_enabled
      AND v_prev_esi IS NOT DISTINCT FROM p_esi_enabled
      AND v_prev_pt IS NOT DISTINCT FROM p_pt_enabled) THEN 'NOOP'
    ELSE 'APPLIED'
  END;

  IF v_status = 'APPLIED' THEN
    UPDATE public.hr_employees
    SET pf_enabled = p_pf_enabled,
        esi_enabled = p_esi_enabled,
        pt_enabled = p_pt_enabled,
        updated_at = now()
    WHERE id = p_employee_id;
  END IF;

  INSERT INTO public.hr_salary_revisions(
    employee_id, revision_type, revision_reason,
    effective_from, approved_by, status, notes,
    statutory_snapshot
  ) VALUES (
    p_employee_id, 'statutory_toggle', p_reason,
    p_effective_from, p_approved_by, v_status,
    CASE
      WHEN p_pf_enabled = false OR p_esi_enabled = false OR p_pt_enabled = false
        THEN 'Statutory exemption toggle — see snapshot'
      ELSE 'Statutory re-enrollment toggle — see snapshot'
    END,
    v_snapshot
  ) RETURNING id INTO v_revision_id;

  RETURN jsonb_build_object(
    'id', v_revision_id,
    'status', v_status,
    'effective_from', p_effective_from,
    'snapshot', v_snapshot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_statutory_revision(uuid, boolean, boolean, boolean, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_statutory_revision(uuid, boolean, boolean, boolean, date, text, text) TO service_role;

-- 5. Scheduled revision applier — pick up SCHEDULED statutory toggles when
-- effective_from arrives. Piggybacks on the existing daily revision cron
-- if any; otherwise callable manually.
CREATE OR REPLACE FUNCTION public.apply_due_statutory_revisions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, employee_id, statutory_snapshot
    FROM public.hr_salary_revisions
    WHERE revision_type = 'statutory_toggle'
      AND status = 'SCHEDULED'
      AND effective_from <= CURRENT_DATE
    ORDER BY effective_from ASC
  LOOP
    UPDATE public.hr_employees
    SET pf_enabled = (r.statutory_snapshot->'after'->>'pf_enabled')::boolean,
        esi_enabled = (r.statutory_snapshot->'after'->>'esi_enabled')::boolean,
        pt_enabled = (r.statutory_snapshot->'after'->>'pt_enabled')::boolean,
        updated_at = now()
    WHERE id = r.employee_id;

    UPDATE public.hr_salary_revisions
    SET status = 'APPLIED', applied_at = now()
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_due_statutory_revisions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_due_statutory_revisions() TO service_role;
