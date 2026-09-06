DO $mig$
DECLARE
  src text;
  old_accrual text := 'AND l.accrual_date BETWEEN v_start AND v_end';
  new_accrual text := 'AND l.accrual_date BETWEEN v_start AND v_end
      AND (l.created_at IS NULL OR (l.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end)';
  old_alloc text := 'AND (a.year < v_year OR (a.year = v_year AND (a.month IS NULL OR a.month <= v_month)))';
  new_alloc text := 'AND (a.year < v_year
           OR (a.year = v_year AND a.month IS NOT NULL AND a.month <= v_month)
           OR (a.year = v_year AND a.month IS NULL
               AND (a.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end))';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'hr_leave_month_breakdown';

  IF src IS NULL THEN RAISE EXCEPTION 'hr_leave_month_breakdown not found'; END IF;
  IF position(old_accrual in src) = 0 THEN RAISE EXCEPTION 'accrual predicate not found'; END IF;
  IF position(old_alloc in src) = 0 THEN RAISE EXCEPTION 'allocation predicate not found'; END IF;

  src := replace(src, old_accrual, new_accrual);
  src := replace(src, old_alloc, new_alloc);
  EXECUTE src;
END
$mig$;