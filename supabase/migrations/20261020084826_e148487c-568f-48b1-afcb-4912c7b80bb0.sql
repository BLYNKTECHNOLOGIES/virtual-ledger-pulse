-- Leave credited in a month may fund any leave day in that same month (credits land on the 15th only because payroll runs earlier).
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.hr_leave_available(uuid,uuid,date,date,uuid)','public.hr_leave_take_from(uuid,uuid,date,date,numeric)'] LOOP
    d := pg_get_functiondef(f::regprocedure);
    IF position('l.accrual_date > p_end' in d) = 0 THEN RAISE EXCEPTION 'pattern missing in %', f; END IF;
    d := replace(d, 'l.accrual_date > p_end',
      'l.accrual_date > (date_trunc(''month'', p_end) + interval ''1 month - 1 day'')::date');
    EXECUTE d;
  END LOOP;
END $$;