DO $do$
DECLARE src text; newsrc text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_v4_recompute_range';

  IF src IS NULL THEN
    RAISE EXCEPTION 'hr_v4_recompute_range not found';
  END IF;

  newsrc := replace(src, 'p_employee_id, ''late'', d.attendance_date', 'p_employee_id, ''late_come'', d.attendance_date');

  IF newsrc = src THEN
    RAISE NOTICE 'no change needed for hr_v4_recompute_range';
  ELSE
    EXECUTE newsrc;
  END IF;
END $do$;