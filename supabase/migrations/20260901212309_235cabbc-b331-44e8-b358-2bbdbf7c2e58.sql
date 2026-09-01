
CREATE OR REPLACE FUNCTION public.hr_test_accrual_dryrun()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  out_txt text := '';
  c int;
  v_emp uuid;
  v_cl uuid; v_sl uuid;
  v_prob int; v_conf int;
BEGIN
  SELECT id INTO v_cl FROM hr_leave_types WHERE code='CL';
  SELECT id INTO v_sl FROM hr_leave_types WHERE code='SL';
  BEGIN
    c := public.run_leave_accrual('2026-09-09'); out_txt := out_txt || format('09-Sep (before day 10): %s credits', c);
    c := public.run_leave_accrual('2026-09-10'); out_txt := out_txt || format(E'\n10-Sep: %s credits', c);
    c := public.run_leave_accrual('2026-09-10'); out_txt := out_txt || format(E'\n10-Sep rerun: %s credits', c);
    c := public.run_leave_accrual('2026-09-15'); out_txt := out_txt || format(E'\n15-Sep same month: %s credits', c);

    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_cl AND l.accrual_date='2026-09-10';
    out_txt := out_txt || format(E'\n  CL credited to %s employees', c);
    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2026-09-10';
    out_txt := out_txt || format(E'\n  SL credited to %s employees', c);
    SELECT count(*) INTO v_prob FROM hr_employees e WHERE e.is_active AND hr_is_on_probation(e.id,'2026-09-10');
    out_txt := out_txt || format(E'\n  employees on probation (must get 0 SL): %s', v_prob);
    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2026-09-10'
        AND hr_is_on_probation(l.employee_id,'2026-09-10');
    out_txt := out_txt || format(E'\n  SL wrongly credited on probation: %s', c);

    -- SL anniversary: not due at +6 months, due at +12 months
    c := public.run_leave_accrual('2027-03-10'); out_txt := out_txt || format(E'\n10-Mar-2027 (6m later): %s credits (CL only expected)', c);
    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2027-03-10';
    out_txt := out_txt || format(E'\n  SL at 6 months (expect 0): %s', c);
    c := public.run_leave_accrual('2027-09-10'); out_txt := out_txt || format(E'\n10-Sep-2027 (12m later): %s credits', c);
    SELECT count(*) INTO c FROM hr_leave_accrual_log l JOIN hr_leave_accrual_plans p ON p.id=l.accrual_plan_id
      WHERE p.leave_type_id=v_sl AND l.accrual_date='2027-09-10';
    out_txt := out_txt || format(E'\n  SL renewed for %s employees', c);

    -- year boundary carry forward for CL
    c := public.run_leave_accrual('2027-01-10');
    SELECT count(*) INTO c FROM hr_leave_allocations a
      WHERE a.leave_type_id=v_cl AND a.year=2027 AND COALESCE(a.carry_forward_days,0) > 0;
    out_txt := out_txt || format(E'\n2027 CL rows with carried-forward balance: %s', c);

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN out_txt := out_txt || E'\nERROR: ' || SQLERRM; END IF;
  END;
  RETURN out_txt;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hr_test_accrual_dryrun() FROM PUBLIC, anon, authenticated;
