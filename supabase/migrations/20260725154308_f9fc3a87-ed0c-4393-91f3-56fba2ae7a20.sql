-- Helper: rescale hr_employee_salary_structures so active components sum to p_new_total
CREATE OR REPLACE FUNCTION public._rescale_employee_salary_structure(
  p_employee_id uuid,
  p_new_total   numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_total numeric;
  v_count     int;
  v_ratio     numeric;
BEGIN
  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION 'Rescale requires a non-negative new total';
  END IF;

  SELECT COALESCE(SUM(amount),0), COUNT(*)
    INTO v_old_total, v_count
  FROM public.hr_employee_salary_structures
  WHERE employee_id = p_employee_id AND is_active = true;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Employee % has no active salary components. Build a salary structure before revising.', p_employee_id;
  END IF;

  IF v_old_total = 0 THEN
    -- Degenerate case: put entire new total on the first active component.
    UPDATE public.hr_employee_salary_structures s
       SET amount = p_new_total,
           updated_at = now()
     WHERE s.id = (
        SELECT id FROM public.hr_employee_salary_structures
         WHERE employee_id = p_employee_id AND is_active = true
         ORDER BY created_at ASC LIMIT 1
     );
    UPDATE public.hr_employee_salary_structures
       SET amount = 0, updated_at = now()
     WHERE employee_id = p_employee_id
       AND is_active = true
       AND id <> (
         SELECT id FROM public.hr_employee_salary_structures
          WHERE employee_id = p_employee_id AND is_active = true
          ORDER BY created_at ASC LIMIT 1
       );
    RETURN;
  END IF;

  v_ratio := p_new_total / v_old_total;

  -- Scale every active component by the ratio, rounded to 2dp.
  UPDATE public.hr_employee_salary_structures
     SET amount = ROUND(amount * v_ratio, 2),
         updated_at = now()
   WHERE employee_id = p_employee_id
     AND is_active = true;

  -- Correct rounding drift on the largest component so sum == p_new_total exactly.
  WITH sums AS (
    SELECT COALESCE(SUM(amount),0) AS s FROM public.hr_employee_salary_structures
     WHERE employee_id = p_employee_id AND is_active = true
  ), pick AS (
    SELECT id FROM public.hr_employee_salary_structures
     WHERE employee_id = p_employee_id AND is_active = true
     ORDER BY amount DESC, created_at ASC LIMIT 1
  )
  UPDATE public.hr_employee_salary_structures s
     SET amount = amount + (p_new_total - (SELECT s FROM sums)),
         updated_at = now()
   WHERE s.id = (SELECT id FROM pick);
END;
$$;

GRANT EXECUTE ON FUNCTION public._rescale_employee_salary_structure(uuid,numeric) TO authenticated, service_role;

-- Patch apply_salary_revision to also rescale structure on the immediate path
CREATE OR REPLACE FUNCTION public.apply_salary_revision(
  p_employee_id uuid,
  p_new_basic numeric,
  p_new_total numeric,
  p_revision_type text,
  p_reason text,
  p_effective_from date,
  p_approved_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_prev_basic numeric;
  v_prev_total numeric;
  v_row_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.user_has_permission(v_uid, 'hrms_manage'::app_permission)
      OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                 WHERE ur.user_id = v_uid AND lower(r.name) = 'super admin')
    INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Permission denied: HRMS manage required';
  END IF;

  IF p_revision_type NOT IN ('increment','promotion','correction','demotion') THEN
    RAISE EXCEPTION 'Invalid revision type: %', p_revision_type;
  END IF;

  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION 'New total salary must be a non-negative number';
  END IF;

  SELECT basic_salary, total_salary INTO v_prev_basic, v_prev_total
    FROM public.hr_employees WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF COALESCE(v_prev_basic,0) = COALESCE(p_new_basic,0)
     AND COALESCE(v_prev_total,0) = COALESCE(p_new_total,0) THEN
    RAISE EXCEPTION 'No change: new amounts match current salary';
  END IF;

  -- Scheduled path
  IF p_effective_from > CURRENT_DATE THEN
    INSERT INTO public.hr_salary_revisions(
      employee_id, previous_basic, new_basic, previous_total, new_total,
      revision_type, revision_reason, approved_by, effective_from, status
    ) VALUES (
      p_employee_id, v_prev_basic, p_new_basic, v_prev_total, p_new_total,
      p_revision_type, p_reason, p_approved_by, p_effective_from, 'SCHEDULED'
    )
    RETURNING id INTO v_row_id;

    RETURN jsonb_build_object('status','SCHEDULED','id',v_row_id,'effective_from',p_effective_from);
  END IF;

  -- Immediate path: seed session vars for the trigger, then update employee
  PERFORM set_config('app.revision_type', p_revision_type, true);
  PERFORM set_config('app.revision_reason', COALESCE(p_reason,''), true);
  PERFORM set_config('app.revision_approved_by', COALESCE(p_approved_by,''), true);
  PERFORM set_config('app.revision_effective_from', COALESCE(p_effective_from, CURRENT_DATE)::text, true);

  UPDATE public.hr_employees
     SET basic_salary = p_new_basic,
         total_salary = p_new_total,
         updated_at = now()
   WHERE id = p_employee_id;

  -- CRITICAL: also rescale the active salary structure so the RazorpayX push
  -- (which reads from hr_employee_salary_structures) sends the new total.
  PERFORM public._rescale_employee_salary_structure(p_employee_id, p_new_total);

  SELECT id INTO v_row_id FROM public.hr_salary_revisions
   WHERE employee_id = p_employee_id
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object('status','APPLIED','id',v_row_id,'effective_from',COALESCE(p_effective_from,CURRENT_DATE));
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_salary_revision(uuid,numeric,numeric,text,text,date,text) TO authenticated;

-- Patch promote_scheduled_salary_revision to also rescale on the promotion day
CREATE OR REPLACE FUNCTION public.promote_scheduled_salary_revision(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.hr_salary_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.hr_salary_revisions WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision % not found', p_row_id;
  END IF;
  IF v_row.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('status', v_row.status, 'id', v_row.id, 'noop', true);
  END IF;

  PERFORM set_config('app.revision_type', v_row.revision_type, true);
  PERFORM set_config('app.revision_reason', COALESCE(v_row.revision_reason,''), true);
  PERFORM set_config('app.revision_approved_by', COALESCE(v_row.approved_by,''), true);
  PERFORM set_config('app.revision_effective_from', COALESCE(v_row.effective_from, CURRENT_DATE)::text, true);
  PERFORM set_config('app.promoting_revision_id', v_row.id::text, true);

  UPDATE public.hr_employees
     SET basic_salary = v_row.new_basic,
         total_salary = v_row.new_total,
         updated_at   = now()
   WHERE id = v_row.employee_id;

  PERFORM public._rescale_employee_salary_structure(v_row.employee_id, v_row.new_total);

  UPDATE public.hr_salary_revisions
     SET status = 'APPLIED', updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('status','APPLIED','id',v_row.id,'employee_id',v_row.employee_id,'new_total',v_row.new_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_scheduled_salary_revision(uuid) TO service_role;