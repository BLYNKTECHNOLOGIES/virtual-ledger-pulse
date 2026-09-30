DO $$
DECLARE r record; v_target numeric;
BEGIN
  CREATE TEMP TABLE ph ON COMMIT DROP AS
    SELECT id, employee_id, previous_total, created_at FROM public.hr_salary_revisions
    WHERE revision_type='correction' AND revision_reason IS NULL AND created_at >= '2026-09-18'
      AND new_total IS NOT NULL AND previous_total IS NOT NULL AND new_total < previous_total;

  DELETE FROM public.hr_payroll_input_additions WHERE pushed_at IS NULL AND source_revision_id IN (SELECT id FROM ph);
  DELETE FROM public.hr_payroll_input_deductions WHERE pushed_at IS NULL AND source_revision_id IN (SELECT id FROM ph);

  FOR r IN SELECT employee_id, (array_agg(previous_total ORDER BY created_at))[1] first_prev, min(created_at) first_at FROM ph GROUP BY employee_id LOOP
    SELECT new_total INTO v_target FROM public.hr_salary_revisions s
      WHERE s.employee_id=r.employee_id AND s.id NOT IN (SELECT id FROM ph) AND s.created_at > r.first_at
        AND s.new_total IS NOT NULL AND upper(coalesce(s.status,''))='APPLIED'
      ORDER BY s.created_at DESC LIMIT 1;
    v_target := coalesce(v_target, r.first_prev);
    PERFORM set_config('app.revision_source_id', gen_random_uuid()::text, true);
    UPDATE public.hr_employees SET total_salary=v_target WHERE id=r.employee_id;
    PERFORM public._rescale_employee_salary_structure(r.employee_id, v_target);
  END LOOP;
  PERFORM set_config('app.revision_source_id', '', true);

  DELETE FROM public.hr_salary_revisions WHERE id IN (SELECT id FROM ph);
END $$;