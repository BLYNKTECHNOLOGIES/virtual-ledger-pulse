DROP FUNCTION IF EXISTS public.hr_cl_available(uuid[], date);
CREATE FUNCTION public.hr_cl_available(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(employee_id uuid, cl_available numeric, cl_auto_booked numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ms AS (
    SELECT EXTRACT(YEAR FROM date_trunc('month', p_period_month))::int AS y,
           EXTRACT(MONTH FROM date_trunc('month', p_period_month))::int AS m,
           date_trunc('month', p_period_month)::date AS d0,
           (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date AS d1
  ),
  emp AS (SELECT unnest(p_employee_ids) AS id),
  bal AS (
    SELECT e.id,
           COALESCE(SUM(GREATEST(COALESCE(a.allocated_days,0) - COALESCE(a.used_days,0), 0)), 0)::numeric AS bal
    FROM emp e
    CROSS JOIN ms
    LEFT JOIN public.hr_leave_allocations a
      ON a.employee_id = e.id
     AND a.expired_date IS NULL
     AND (a.year < ms.y OR (a.year = ms.y AND (a.month IS NULL OR a.month <= ms.m)))
     AND a.leave_type_id IN (SELECT id FROM public.hr_leave_types WHERE code = 'CL')
    GROUP BY e.id
  ),
  auto AS (
    SELECT e.id,
           COALESCE(SUM(c.days), 0)::numeric AS booked
    FROM emp e
    CROSS JOIN ms
    LEFT JOIN public.hr_leave_requests lr
      ON lr.employee_id = e.id
     AND lr.source = 'auto_lop_absorption'
     AND lr.start_date BETWEEN ms.d0 AND ms.d1
    LEFT JOIN public.hr_leave_request_consumption c ON c.request_id = lr.id
    GROUP BY e.id
  )
  SELECT b.id, GREATEST(b.bal, 0) + COALESCE(a.booked, 0), COALESCE(a.booked, 0)
  FROM bal b LEFT JOIN auto a ON a.id = b.id;
$$;

REVOKE ALL ON FUNCTION public.hr_cl_available(uuid[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_cl_available(uuid[], date) TO service_role;
