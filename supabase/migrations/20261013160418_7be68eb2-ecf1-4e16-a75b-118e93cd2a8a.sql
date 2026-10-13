DO $m$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.hr_apply_statutory_change(uuid,date,boolean,text,text,numeric,boolean,boolean,text,text,text)'::regprocedure);
  src := replace(src, 'WHERE c.period_month = v_month AND c.step_no = 7', 'WHERE c.period_month >= v_month AND c.step_no = 7');
  src := replace(src, '''Payroll for % is already closed — pick a later effective month'', to_char(v_month, ''FMMonth YYYY'')',
    '''A payroll month on or after % is already closed — changes can only take effect after the latest closed month'', to_char(v_month, ''FMMonth YYYY'')');
  IF position('c.period_month >= v_month' in src) = 0 THEN RAISE EXCEPTION 'guard not patched'; END IF;
  EXECUTE src;
END $m$;