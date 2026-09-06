DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'hr_lop_days_window'
    AND pg_get_function_identity_arguments(p.oid) = 'p_employee_ids uuid[], p_period_month date, p_from date, p_to date';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'public.hr_lop_days_window(uuid[],date,date,date) not found';
  END IF;

  IF position('auto_lop_absorption' in v_def) = 0 THEN
    v_def := replace(
      v_def,
      'WHERE lr.employee_id = ANY(p_employee_ids) AND LOWER(lr.status) = ''approved''
      AND lr.start_date <= v_win_end AND lr.end_date >= v_win_start',
      'WHERE lr.employee_id = ANY(p_employee_ids) AND LOWER(lr.status) = ''approved''
      AND COALESCE(lr.source, '''') <> ''auto_lop_absorption''
      AND lr.start_date <= v_win_end AND lr.end_date >= v_win_start'
    );
  END IF;

  IF position('auto_lop_absorption' in v_def) = 0 THEN
    RAISE EXCEPTION 'Could not add synthetic-absorption exclusion to hr_lop_days_window';
  END IF;

  EXECUTE v_def;
END
$do$;

CREATE OR REPLACE FUNCTION public.hr_cl_available(
  p_employee_ids uuid[],
  p_period_month date
)
RETURNS TABLE(employee_id uuid, cl_available numeric, cl_auto_booked numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ms AS (
    SELECT date_trunc('month', p_period_month)::date AS d0,
           (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date AS d1,
           EXTRACT(YEAR FROM p_period_month)::int AS y,
           EXTRACT(MONTH FROM p_period_month)::int AS m
  ),
  emp AS (
    SELECT unnest(p_employee_ids) AS id
  ),
  cl_type AS (
    SELECT id FROM public.hr_leave_types WHERE code = 'CL'
  ),
  dated_accrual AS (
    SELECT l.employee_id, COALESCE(SUM(l.accrued_days), 0)::numeric AS days
    FROM public.hr_leave_accrual_log l
    JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
    JOIN cl_type t ON t.id = p.leave_type_id
    CROSS JOIN ms
    WHERE l.employee_id = ANY(p_employee_ids)
      AND l.accrual_date <= ms.d1
    GROUP BY l.employee_id
  ),
  manual_credit AS (
    SELECT a.employee_id,
           COALESCE(SUM(COALESCE(a.allocated_days,0)), 0)::numeric AS days
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
            SELECT 1
            FROM public.hr_leave_accrual_log l
            JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
            WHERE l.employee_id = a.employee_id
              AND p.leave_type_id = a.leave_type_id
              AND l.year = a.year
          )
          AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ms.d1
        )
      )
    GROUP BY a.employee_id
  ),
  ordinary_used AS (
    SELECT r.employee_id, COALESCE(SUM(c.days),0)::numeric AS days
    FROM public.hr_leave_request_consumption c
    JOIN public.hr_leave_requests r ON r.id = c.request_id
    JOIN cl_type t ON t.id = c.leave_type_id
    CROSS JOIN ms
    WHERE r.employee_id = ANY(p_employee_ids)
      AND lower(COALESCE(r.status,'')) = 'approved'
      AND COALESCE(r.source,'') <> 'auto_lop_absorption'
      AND r.start_date <= ms.d1
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

DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'hr_apply_cl_lop_absorption'
    AND pg_get_function_identity_arguments(p.oid) = 'p_absorptions jsonb, p_period_month date, p_scope_employee_ids uuid[]';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'public.hr_apply_cl_lop_absorption(jsonb,date,uuid[]) not found';
  END IF;

  v_def := replace(
    v_def,
    'OR (al.year = EXTRACT(YEAR FROM v_start)::int AND al.month IS NULL
                  AND (al.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end)',
    'OR (al.year = EXTRACT(YEAR FROM v_start)::int AND al.month IS NULL
                  AND ((al.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end
                       OR EXISTS (
                         SELECT 1
                         FROM public.hr_leave_accrual_log l
                         JOIN public.hr_leave_accrual_plans p ON p.id = l.accrual_plan_id
                         WHERE l.employee_id = al.employee_id
                           AND p.leave_type_id = al.leave_type_id
                           AND l.accrual_date <= v_end
                       )))'
  );

  EXECUTE v_def;
END
$do$;

GRANT EXECUTE ON FUNCTION public.hr_lop_days_window(uuid[], date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_cl_available(uuid[], date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_apply_cl_lop_absorption(jsonb, date, uuid[]) TO authenticated, service_role;