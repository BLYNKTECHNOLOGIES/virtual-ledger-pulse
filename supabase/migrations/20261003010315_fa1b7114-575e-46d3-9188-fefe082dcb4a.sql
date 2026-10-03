-- Encashment is not payable under the current F&F policy. Preserve financial totals
-- and settlement state: these ten metadata values were never part of net_payable.
CREATE OR REPLACE FUNCTION public.fn_auto_compute_fnf_encashment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  NEW.leave_encashment_days := 0;
  NEW.leave_encashment_amount := 0;
  RETURN NEW;
END $$;

UPDATE public.hr_fnf_settlements
SET leave_encashment_days = 0, leave_encashment_amount = 0
WHERE COALESCE(leave_encashment_days,0) <> 0 OR COALESCE(leave_encashment_amount,0) <> 0;

-- All staging routes, including HR manual entries and service-role jobs, pass
-- through these tables. Never stage a new payroll month after the LWD month.
-- The exit month remains eligible for salary and its staged F&F additions.
CREATE OR REPLACE FUNCTION public.hr_guard_post_exit_payroll_input()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public AS $$
DECLARE v_exit date;
BEGIN
  IF NEW.hr_employee_id IS NULL THEN
    RAISE EXCEPTION 'An HR employee mapping is required for payroll input';
  END IF;
  SELECT COALESCE(last_working_day, termination_date) INTO v_exit
  FROM public.hr_employees WHERE id = NEW.hr_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll employee does not exist'; END IF;
  IF v_exit IS NOT NULL AND date_trunc('month', NEW.period_month)::date > date_trunc('month', v_exit)::date THEN
    RAISE EXCEPTION 'Cannot stage payroll input after employee exit month (%); settle corrections through reviewed F&F instead', to_char(v_exit,'YYYY-MM');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_guard_post_exit_addition ON public.hr_payroll_input_additions;
CREATE TRIGGER trg_hr_guard_post_exit_addition BEFORE INSERT OR UPDATE OF hr_employee_id,period_month
ON public.hr_payroll_input_additions FOR EACH ROW EXECUTE FUNCTION public.hr_guard_post_exit_payroll_input();
DROP TRIGGER IF EXISTS trg_hr_guard_post_exit_deduction ON public.hr_payroll_input_deductions;
CREATE TRIGGER trg_hr_guard_post_exit_deduction BEFORE INSERT OR UPDATE OF hr_employee_id,period_month
ON public.hr_payroll_input_deductions FOR EACH ROW EXECUTE FUNCTION public.hr_guard_post_exit_payroll_input();

-- A pending salary change after exit cannot be sent, even if a future change
-- to is_active accidentally marks a departed person active again.
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
    AND (COALESCE(e.last_working_day,e.termination_date) IS NULL
         OR l.effective_from <= COALESCE(e.last_working_day,e.termination_date))
    AND public.hr_open_payroll_month() >= l.push_after_month
    AND round(e.total_salary) = round(l.new_total)
    AND (
      EXISTS (SELECT 1 FROM public.hr_payslips ps
              WHERE ps.employee_id = l.employee_id
                AND date_trunc('month', ps.period_month)::date = (l.push_after_month - interval '1 month')::date)
      OR NOT EXISTS (SELECT 1 FROM public.hr_payslips ps
              WHERE ps.employee_id = l.employee_id AND ps.period_month < l.push_after_month)
         AND COALESCE((SELECT min(wi.joining_date) FROM public.hr_employee_work_info wi WHERE wi.employee_id = l.employee_id), l.push_after_month) >= l.push_after_month
    )
    AND (p_revision_id IS NULL OR l.id = p_revision_id);
$$;

UPDATE public.hr_salary_revisions sr SET razorpay_push_state = 'cancelled',
  razorpay_push_error = 'Cancelled: effective date after employee last working day; no post-exit CTC push'
FROM public.hr_employees e
WHERE sr.employee_id=e.id
  AND COALESCE(e.last_working_day,e.termination_date) IS NOT NULL
  AND sr.effective_from > COALESCE(e.last_working_day,e.termination_date)
  AND sr.razorpay_push_state IN ('held','failed','queued')
  AND sr.razorpay_pushed_at IS NULL;