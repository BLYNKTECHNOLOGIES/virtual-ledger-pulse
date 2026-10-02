DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.hr_leave_month_breakdown(uuid[],date)'::regprocedure);
  d := replace(d, '  post_used AS (', $x$  bal AS (
    SELECT e2.emp_id,
      (SELECT COALESCE(SUM(l.accrued_days),0) FROM public.hr_leave_accrual_log l JOIN public.hr_leave_accrual_plans p ON p.id=l.accrual_plan_id JOIN public.hr_leave_types t ON t.id=p.leave_type_id WHERE t.code='CL' AND l.employee_id=e2.emp_id AND l.accrual_date<=v_end)
      + (SELECT COALESCE(SUM(COALESCE(a.allocated_days,0)),0) FROM public.hr_leave_allocations a JOIN public.hr_leave_types t ON t.id=a.leave_type_id WHERE t.code='CL' AND a.employee_id=e2.emp_id AND a.expired_date IS NULL
           AND ((a.month IS NOT NULL AND (a.year<v_year OR (a.year=v_year AND a.month<=v_month)))
             OR (a.month IS NULL AND NOT EXISTS (SELECT 1 FROM public.hr_leave_accrual_log l JOIN public.hr_leave_accrual_plans p ON p.id=l.accrual_plan_id WHERE l.employee_id=a.employee_id AND p.leave_type_id=a.leave_type_id AND l.year=a.year) AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date<=v_end)))
      - (SELECT COALESCE(SUM(c.days),0) FROM public.hr_leave_request_consumption c JOIN public.hr_leave_requests r ON r.id=c.request_id JOIN public.hr_leave_types t ON t.id=c.leave_type_id WHERE t.code='CL' AND r.employee_id=e2.emp_id AND lower(COALESCE(r.status,''))='approved' AND r.start_date<=v_end) AS cl_bal,
      (SELECT COALESCE(SUM(l.accrued_days),0) FROM public.hr_leave_accrual_log l JOIN public.hr_leave_accrual_plans p ON p.id=l.accrual_plan_id JOIN public.hr_leave_types t ON t.id=p.leave_type_id WHERE t.code='SL' AND l.employee_id=e2.emp_id AND l.accrual_date<=v_end)
      + (SELECT COALESCE(SUM(COALESCE(a.allocated_days,0)),0) FROM public.hr_leave_allocations a JOIN public.hr_leave_types t ON t.id=a.leave_type_id WHERE t.code='SL' AND a.employee_id=e2.emp_id AND a.expired_date IS NULL
           AND ((a.month IS NOT NULL AND (a.year<v_year OR (a.year=v_year AND a.month<=v_month)))
             OR (a.month IS NULL AND NOT EXISTS (SELECT 1 FROM public.hr_leave_accrual_log l JOIN public.hr_leave_accrual_plans p ON p.id=l.accrual_plan_id WHERE l.employee_id=a.employee_id AND p.leave_type_id=a.leave_type_id AND l.year=a.year) AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date<=v_end)))
      - (SELECT COALESCE(SUM(c.days),0) FROM public.hr_leave_request_consumption c JOIN public.hr_leave_requests r ON r.id=c.request_id JOIN public.hr_leave_types t ON t.id=c.leave_type_id WHERE t.code='SL' AND r.employee_id=e2.emp_id AND lower(COALESCE(r.status,''))='approved' AND r.start_date<=v_end) AS sl_bal
    FROM emp e2
  ),
  post_used AS ($x$);
  d := replace(d, 'COALESCE(al.cl_bal,0) + COALESCE(pu.cl_after,0)', 'COALESCE(bl.cl_bal,0)');
  d := replace(d, 'COALESCE(al.sl_bal,0) + COALESCE(pu.sl_after,0)', 'COALESCE(bl.sl_bal,0)');
  d := replace(d, '  LEFT JOIN co_settle cs ON cs.emp_id = em.emp_id;', '  LEFT JOIN co_settle cs ON cs.emp_id = em.emp_id
  LEFT JOIN bal bl ON bl.emp_id = em.emp_id;');
  IF position('bl.cl_bal' in d) = 0 OR position('LEFT JOIN bal bl' in d) = 0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE d;
END $mig$;