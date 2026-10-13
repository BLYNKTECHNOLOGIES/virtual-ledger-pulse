CREATE OR REPLACE FUNCTION public.ats_first_name(p_full_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
DECLARE t text[]; i int := 1; n int;
BEGIN
  t := regexp_split_to_array(btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), ' ');
  n := coalesce(array_length(t, 1), 0);
  IF n = 0 OR t[1] = '' THEN RETURN 'Candidate'; END IF;
  WHILE i < n AND (lower(rtrim(t[i], '.')) IN ('mr','mrs','ms','miss','dr','shri','shree','sri','smt','kumari','km','er','prof','md','mohd','mo')
                   OR t[i] ~* '^[a-z](\.[a-z]){0,2}\.?$'
                   OR (t[i] ~* '^[a-z]{2,3}$' AND t[i] !~* '[aeiou]')) LOOP
    i := i + 1;
  END LOOP;
  RETURN public.ats_name_case(t[i]);
END $$;