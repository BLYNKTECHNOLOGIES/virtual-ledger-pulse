DO $mig$
DECLARE
  src text; old_clause text := '      AND l.accrual_date BETWEEN v_start AND v_end
      AND (l.created_at IS NULL OR (l.created_at AT TIME ZONE ''Asia/Kolkata'')::date <= v_end)';
  new_clause text := '      AND l.accrual_date BETWEEN v_start AND v_end';
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc WHERE proname = 'hr_leave_month_breakdown';
  IF position(old_clause in src) = 0 THEN
    RAISE EXCEPTION 'accrued clause not found';
  END IF;
  EXECUTE replace(src, old_clause, new_clause);
END
$mig$;