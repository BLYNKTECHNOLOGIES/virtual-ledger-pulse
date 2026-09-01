
CREATE OR REPLACE FUNCTION public.hr_test_accrual_dryrun()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  out_txt text := '';
  c int; c2 int;
  v_cl uuid; v_sl uuid;
  v_joiner uuid;
BEGIN
  SELECT id INTO v_cl FROM hr_leave_types WHERE code='CL';
  SELECT id INTO v_sl FROM hr_leave_types WHERE code='SL';
  BEGIN
    -- simulate a mid-month joiner (joins 12 Sep, after the 10th)
    SELECT e.id INTO v_joiner FROM hr_employees e JOIN hr_employee_work_info wi ON wi.employee_id=e.id
      WHERE e.is_active ORDER BY e.created_at LIMIT 1;
    UPDATE hr_employee_work_info SET joining_date='2026-09-12' WHERE employee_id=v_joiner;

    c := public.run_leave_accrual('2026-09-09'); out_txt := format('09-Sep (before day 10): %s credits', c);
    c := public.run_leave_accrual('2026-09-10'); out_txt := out_txt || format(E'\n10-Sep: %s credits', c);
    c := public.run_leave_accrual('2026-09-10'); out_txt := out_txt || format(E'\n10-Sep rerun: %s credits', c);

    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_cl AND l.accrual_date='2026-09-10';
    SELECT count(*) INTO c2 FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2026-09-10';
    out_txt := out_txt || format(E'\n  CL to %s employees, SL to %s employees', c, c2);

    SELECT count(*) INTO c FROM hr_employees e WHERE e.is_active AND hr_is_on_probation(e.id,'2026-09-10');
    out_txt := out_txt || format(E'\n  on probation on 10-Sep: %s', c);
    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2026-09-10' AND hr_is_on_probation(l.employee_id,'2026-09-10');
    out_txt := out_txt || format(E'\n  SL wrongly credited on probation (expect 0): %s', c);

    -- mid-month joiner: skipped on the 10th, picked up on the next daily run
    SELECT count(*) INTO c FROM hr_leave_accrual_log WHERE employee_id=v_joiner AND accrual_date='2026-09-10';
    out_txt := out_txt || format(E'\n  joiner (12-Sep) credited on 10-Sep (expect 0): %s', c);
    c := public.run_leave_accrual('2026-09-15');
    SELECT count(*) INTO c2 FROM hr_leave_accrual_log WHERE employee_id=v_joiner AND accrual_date='2026-09-15';
    out_txt := out_txt || format(E'\n15-Sep run: %s credits; joiner credited (expect 1): %s', c, c2);

    -- next month
    c := public.run_leave_accrual('2026-10-10'); out_txt := out_txt || format(E'\n10-Oct: %s credits', c);

    -- SL anniversary
    c := public.run_leave_accrual('2027-03-10');
    SELECT count(*) INTO c2 FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2027-03-10';
    out_txt := out_txt || format(E'\n10-Mar-2027 (6m): %s credits, SL among them (expect 0): %s', c, c2);
    c := public.run_leave_accrual('2027-09-10');
    SELECT count(*) INTO c2 FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2027-09-10';
    out_txt := out_txt || format(E'\n10-Sep-2027 (12m): %s credits, SL renewed for %s employees', c, c2);

    -- year rollover carry forward
    c := public.run_leave_accrual('2027-01-10');
    SELECT count(*) INTO c FROM hr_leave_allocations WHERE leave_type_id=v_cl AND year=2027 AND COALESCE(carry_forward_days,0)>0;
    SELECT count(*) INTO c2 FROM hr_leave_allocations WHERE leave_type_id=v_cl AND year=2026 AND COALESCE(available_days,0)>0;
    out_txt := out_txt || format(E'\n2027 CL rows carrying a balance: %s (2026 rows with balance: %s)', c, c2);

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN out_txt := out_txt || E'\nERROR: ' || SQLERRM; END IF;
  END;
  RETURN out_txt;
END;
$fn$;
