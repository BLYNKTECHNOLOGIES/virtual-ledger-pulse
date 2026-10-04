CREATE OR REPLACE FUNCTION public.hr_ctc_month_released(_push_after date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.hr_open_payroll_month() >= _push_after
      OR EXISTS (SELECT 1 FROM public.hr_payroll_cockpit_state c
                 WHERE c.period_month = (_push_after - interval '1 month')::date
                   AND c.step_no = 7 AND c.status = 'done');
$$;
REVOKE ALL ON FUNCTION public.hr_ctc_month_released(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_ctc_month_released(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_ctc_revisions_due_for_push(p_revision_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(revision_id uuid, employee_id uuid, razorpay_employee_id text, new_total numeric, push_after_month date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    AND (COALESCE(e.last_working_day,e.termination_date) IS NULL
         OR l.effective_from <= COALESCE(e.last_working_day,e.termination_date))
    AND public.hr_ctc_month_released(l.push_after_month)
    AND round(e.total_salary) = round(l.new_total)
    AND (
      EXISTS (SELECT 1 FROM public.hr_payslips ps
              WHERE ps.employee_id = l.employee_id
                AND date_trunc('month', ps.period_month)::date = (l.push_after_month - interval '1 month')::date)
      OR EXISTS (SELECT 1 FROM public.hr_payroll_cockpit_state c
              WHERE c.period_month = (l.push_after_month - interval '1 month')::date AND c.step_no = 7 AND c.status = 'done')
      OR NOT EXISTS (SELECT 1 FROM public.hr_payslips ps
              WHERE ps.employee_id = l.employee_id AND ps.period_month < l.push_after_month)
         AND COALESCE((SELECT min(wi.joining_date) FROM public.hr_employee_work_info wi WHERE wi.employee_id = l.employee_id), l.push_after_month) >= l.push_after_month
    )
    AND (p_revision_id IS NULL OR l.id = p_revision_id);
$function$;

CREATE OR REPLACE FUNCTION public.hr_ctc_push_held(p_employee_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object('held', true, 'revision_id', sr.id, 'push_after_month', sr.push_after_month)
    FROM public.hr_salary_revisions sr
    WHERE sr.employee_id = p_employee_id AND sr.status = 'APPLIED'
      AND sr.razorpay_push_state IN ('held','queued','failed')
      AND NOT public.hr_ctc_month_released(sr.push_after_month)
    ORDER BY sr.effective_from DESC LIMIT 1), jsonb_build_object('held', false));
$$;

CREATE OR REPLACE FUNCTION public.hr_tg_cockpit_close_push_ctc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.step_no IN (7, 11) AND NEW.status = 'done'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    BEGIN PERFORM public.hr_call_push_held_ctc();
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto CTC push dispatch failed: %', SQLERRM; END;
  END IF;
  RETURN NEW;
END $$;

SELECT public.hr_call_push_held_ctc();