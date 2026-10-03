CREATE OR REPLACE FUNCTION public.hr_stage_due_ctc_transition_adjustments(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  r record;
  out_rows jsonb := '[]'::jsonb;
  res jsonb;
  v_removed int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to stage payroll corrections';
  END IF;

  -- A salary change dated after someone's last working day pays nothing:
  -- remove any un-pushed part-month correction lines for people who had
  -- already left before this month started.
  WITH del_a AS (
    DELETE FROM public.hr_payroll_input_additions a
     USING public.hr_employees e
     WHERE e.id = a.hr_employee_id
       AND a.period_month = v_start
       AND a.source = 'ctc_transition_adjustment'
       AND a.pushed_at IS NULL
       AND e.last_working_day IS NOT NULL
       AND e.last_working_day < v_start
    RETURNING 1
  ), del_d AS (
    DELETE FROM public.hr_payroll_input_deductions d
     USING public.hr_employees e
     WHERE e.id = d.hr_employee_id
       AND d.period_month = v_start
       AND d.source = 'ctc_transition_adjustment'
       AND d.pushed_at IS NULL
       AND e.last_working_day IS NOT NULL
       AND e.last_working_day < v_start
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM del_a) + (SELECT count(*) FROM del_d) INTO v_removed;

  FOR r IN
    SELECT sr.id
      FROM public.hr_salary_revisions sr
      JOIN public.hr_employees e ON e.id = sr.employee_id
     WHERE sr.status IN ('APPLIED','SCHEDULED')
       AND COALESCE(sr.revision_type,'') NOT IN ('payroll_addition','payroll_deduction')
       AND COALESCE(sr.one_time_amount,0) = 0
       AND COALESCE(sr.previous_total,0) > 0
       AND sr.new_total IS NOT NULL
       AND COALESCE(sr.previous_total,0) <> COALESCE(sr.new_total,0)
       AND sr.effective_from BETWEEN v_start AND v_end
       AND EXTRACT(DAY FROM sr.effective_from)::int > 1
       AND (e.last_working_day IS NULL OR e.last_working_day >= sr.effective_from)
     ORDER BY sr.effective_from
  LOOP
    BEGIN
      res := public.hr_stage_ctc_transition_adjustment(r.id, true);
    EXCEPTION WHEN OTHERS THEN
      res := jsonb_build_object('ok', false, 'revision_id', r.id, 'error', SQLERRM);
    END;
    out_rows := out_rows || jsonb_build_array(COALESCE(res, '{}'::jsonb));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'period_month', v_start, 'removed_post_exit_lines', v_removed, 'results', out_rows);
END;
$function$;

DELETE FROM public.hr_payroll_input_additions a
 USING public.hr_employees e
 WHERE e.id = a.hr_employee_id
   AND a.period_month = '2026-09-01'
   AND a.source = 'ctc_transition_adjustment'
   AND a.pushed_at IS NULL
   AND e.last_working_day IS NOT NULL
   AND e.last_working_day < '2026-09-01';