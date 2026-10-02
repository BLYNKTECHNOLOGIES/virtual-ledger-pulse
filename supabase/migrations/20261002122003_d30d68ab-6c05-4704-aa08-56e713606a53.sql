CREATE OR REPLACE FUNCTION public.hr_ctc_revisions_due_for_push(p_revision_id uuid DEFAULT NULL)
RETURNS TABLE(revision_id uuid, employee_id uuid, razorpay_employee_id text, new_total numeric, push_after_month date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (sr.employee_id) sr.*
    FROM public.hr_salary_revisions sr
    WHERE sr.status = 'APPLIED' AND sr.razorpay_push_state IS NOT NULL
      AND sr.razorpay_push_state NOT IN ('cancelled','superseded')
    ORDER BY sr.employee_id, sr.effective_from DESC, sr.created_at DESC
  )
  SELECT l.id, l.employee_id, em.razorpay_employee_id, l.new_total, l.push_after_month
  FROM latest l
  JOIN public.hr_employees e ON e.id = l.employee_id AND e.is_active
  JOIN public.hr_razorpay_employee_map em ON em.hr_employee_id = l.employee_id
  WHERE l.razorpay_push_state IN ('held','queued','failed')
    AND public.hr_open_payroll_month() >= l.push_after_month
    AND round(e.total_salary) = round(l.new_total)
    -- RazorpayX must have actually processed the previous month for this person
    -- (salaries run 1st–10th of the next month); otherwise the new CTC would be
    -- applied to that still-unprocessed month.
    AND (
      EXISTS (SELECT 1 FROM public.hr_payslips ps
              WHERE ps.employee_id = l.employee_id
                AND date_trunc('month', ps.period_month)::date = (l.push_after_month - interval '1 month')::date)
      OR NOT EXISTS (SELECT 1 FROM public.hr_payslips ps
              WHERE ps.employee_id = l.employee_id
                AND ps.period_month < l.push_after_month)
         AND COALESCE((SELECT min(wi.joining_date) FROM public.hr_employee_work_info wi WHERE wi.employee_id = l.employee_id), l.push_after_month) >= l.push_after_month
    )
    AND (p_revision_id IS NULL OR l.id = p_revision_id);
$$;
REVOKE ALL ON FUNCTION public.hr_ctc_revisions_due_for_push(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ctc_revisions_due_for_push(uuid) TO service_role;

DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.hr_cockpit_month_state(date)'::regprocedure) INTO d;
  n := replace(d,
    'OR (NOT x.is_one_time AND NOT EXISTS (',
    'OR (NOT x.is_one_time AND COALESCE(x.razorpay_push_state, '''') NOT IN (''held'',''queued'',''superseded'',''pushed'') AND NOT EXISTS (');
  IF n = d THEN RAISE EXCEPTION 'cockpit patch anchor not found'; END IF;
  EXECUTE n;
END $do$;