DO $mig$
DECLARE
  src text;
  patched text;
  old_clause text := '           OR (a.year = v_year AND a.month IS NULL
               AND (a.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end))';
  new_clause text := '           OR (a.year = v_year AND a.month IS NULL
               AND ((a.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end
                    OR EXISTS (
                      SELECT 1
                      FROM public.hr_leave_accrual_log l
                      JOIN public.hr_leave_accrual_plans pl ON pl.id = l.accrual_plan_id
                      WHERE l.employee_id = a.employee_id
                        AND pl.leave_type_id = a.leave_type_id
                        AND l.year = a.year
                        AND l.accrual_date <= v_end
                    ))))';
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc WHERE proname = 'hr_leave_month_breakdown';
  IF position(old_clause in src) = 0 THEN
    RAISE EXCEPTION 'alloc clause not found — aborting patch';
  END IF;
  patched := replace(src, old_clause, new_clause);
  EXECUTE patched;
END
$mig$;