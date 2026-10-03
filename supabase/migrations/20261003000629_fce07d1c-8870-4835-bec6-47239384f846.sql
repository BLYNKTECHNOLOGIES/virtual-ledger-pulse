DO $$
DECLARE src text; out text; n int;
BEGIN
  src := pg_get_functiondef('public.run_leave_accrual'::regproc);
  n := (length(src) - length(replace(src, 'WHERE e.is_active = true', ''))) / length('WHERE e.is_active = true');
  IF n <> 1 THEN RAISE EXCEPTION 'expected one employee filter, found %', n; END IF;
  -- Owner rule (D4): someone whose last working day falls before the end of the
  -- accrual month earns no leave for that month.
  out := replace(src, 'WHERE e.is_active = true',
    'WHERE e.is_active = true
         AND NOT (COALESCE(e.last_working_day, e.termination_date) IS NOT NULL
                  AND COALESCE(e.last_working_day, e.termination_date)
                      < (date_trunc(''month'', p_accrual_date) + interval ''1 month - 1 day'')::date)');
  EXECUTE out;
END $$;