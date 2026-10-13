DO $do$
DECLARE v text := pg_get_functiondef('public.hr_send_requirement_to_recruitment(uuid)'::regprocedure);
BEGIN
  IF position('hr_is_hr_staff(auth.uid())' in v) = 0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
  EXECUTE replace(v, 'hr_is_hr_staff(auth.uid())', 'hr_wf_is_manager(auth.uid())');
END $do$;