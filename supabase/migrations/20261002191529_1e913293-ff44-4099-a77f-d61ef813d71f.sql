CREATE OR REPLACE FUNCTION public.hr_cl_available(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, cl_available numeric, cl_auto_booked numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH ms AS (
    SELECT date_trunc('month', p_period_month)::date AS d0,
           (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date AS d1,
           EXTRACT(YEAR FROM p_period_month)::int AS y,
           EXTRACT(MONTH FROM p_period_month)::int AS m
  ),
  emp AS (SELECT unnest(p_employee_ids) AS id),
  cl_type AS (SELECT id FROM public.hr_leave_types WHERE code = 'CL'),
  dated_accrual AS (
    SELECT l.employee_id, COALESCE(SUM(l.accrued_days), 0)::numeric AS days
    FROM public.hr_leave_accrual_log l
    JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
    JOIN cl_type t ON t.id = p.leave_type_id
    CROSS JOIN ms
    WHERE l.employee_id = ANY(p_employee_ids) AND l.accrual_date <= ms.d1
    GROUP BY l.employee_id
  ),
  manual_credit AS (
    SELECT a.employee_id, COALESCE(SUM(COALESCE(a.allocated_days,0)), 0)::numeric AS days
    FROM public.hr_leave_allocations a
    JOIN cl_type t ON t.id = a.leave_type_id
    CROSS JOIN ms
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.expired_date IS NULL
      AND (
        (a.month IS NOT NULL AND (a.year < ms.y OR (a.year = ms.y AND a.month <= ms.m)))
        OR (
          a.month IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.hr_leave_accrual_log l
            JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
            WHERE l.employee_id = a.employee_id AND p.leave_type_id = a.leave_type_id AND l.year = a.year
          )
          AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ms.d1
        )
      )
    GROUP BY a.employee_id
  ),
  -- Every approved CL consumption up to month end counts as used, INCLUDING
  -- automatic LOP absorptions of EARLIER months (those days are spent).
  -- Only this month's own automatic absorption is excluded, because the LOP
  -- engine is recomputing it right now.
  ordinary_used AS (
    SELECT r.employee_id, COALESCE(SUM(c.days),0)::numeric AS days
    FROM public.hr_leave_request_consumption c
    JOIN public.hr_leave_requests r ON r.id = c.request_id
    JOIN cl_type t ON t.id = c.leave_type_id
    CROSS JOIN ms
    WHERE r.employee_id = ANY(p_employee_ids)
      AND lower(COALESCE(r.status,'')) = 'approved'
      AND r.start_date <= ms.d1
      AND NOT (COALESCE(r.source,'') = 'auto_lop_absorption' AND r.start_date >= ms.d0)
    GROUP BY r.employee_id
  ),
  auto AS (
    SELECT r.employee_id, COALESCE(SUM(c.days),0)::numeric AS booked
    FROM public.hr_leave_requests r
    JOIN public.hr_leave_request_consumption c ON c.request_id = r.id
    JOIN cl_type t ON t.id = c.leave_type_id
    CROSS JOIN ms
    WHERE r.employee_id = ANY(p_employee_ids)
      AND r.source = 'auto_lop_absorption'
      AND r.start_date BETWEEN ms.d0 AND ms.d1
    GROUP BY r.employee_id
  )
  SELECT e.id,
         GREATEST(COALESCE(ac.days,0) + COALESCE(mc.days,0) - COALESCE(ou.days,0), 0)::numeric,
         COALESCE(a.booked,0)::numeric
  FROM emp e
  LEFT JOIN dated_accrual ac ON ac.employee_id = e.id
  LEFT JOIN manual_credit mc ON mc.employee_id = e.id
  LEFT JOIN ordinary_used ou ON ou.employee_id = e.id
  LEFT JOIN auto a ON a.employee_id = e.id;
$function$;

-- Recovery deductions must point at a real instalment; orphans can never be staged.
CREATE OR REPLACE FUNCTION public.hr_guard_recovery_deduction_ref()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.source = 'auto_recovery' AND NEW.recovery_ref_id IS NOT NULL THEN
    IF NEW.recovery_kind = 'deposit' AND NOT EXISTS (SELECT 1 FROM public.hr_employee_deposit_schedule WHERE id = NEW.recovery_ref_id) THEN
      RAISE EXCEPTION 'Recovery deduction points at a deposit instalment that does not exist (%)', NEW.recovery_ref_id;
    ELSIF NEW.recovery_kind = 'loan' AND NOT EXISTS (SELECT 1 FROM public.hr_loan_repayments WHERE id = NEW.recovery_ref_id) THEN
      RAISE EXCEPTION 'Recovery deduction points at a loan instalment that does not exist (%)', NEW.recovery_ref_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_guard_recovery_deduction_ref ON public.hr_payroll_input_deductions;
CREATE TRIGGER trg_hr_guard_recovery_deduction_ref
BEFORE INSERT ON public.hr_payroll_input_deductions
FOR EACH ROW EXECUTE FUNCTION public.hr_guard_recovery_deduction_ref();