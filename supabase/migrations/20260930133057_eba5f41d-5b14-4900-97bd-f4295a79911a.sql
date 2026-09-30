DO $$ DECLARE b text; v uuid; BEGIN
FOREACH b IN ARRAY ARRAY['16','25'] LOOP
  SELECT id INTO v FROM public.hr_employees WHERE badge_id=b;
  PERFORM set_config('app.revision_source_id', gen_random_uuid()::text, true);
  UPDATE public.hr_employees SET total_salary=156000 WHERE id=v;
  PERFORM public._rescale_employee_salary_structure(v, 156000);
END LOOP;
PERFORM set_config('app.revision_source_id', '', true);
END $$;