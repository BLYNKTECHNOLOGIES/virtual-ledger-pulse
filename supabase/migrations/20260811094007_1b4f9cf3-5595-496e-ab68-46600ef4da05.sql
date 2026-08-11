DO $$
DECLARE
  r record;
  new_qual text;
  new_wc text;
  stmt text;
  pat text := 'has_role\(\s*auth\.uid\(\)\s*,\s*''hr''::text\s*\)';
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual::text ~* pat OR with_check::text ~* pat)
  LOOP
    new_qual := CASE WHEN r.qual IS NULL THEN NULL
                     ELSE regexp_replace(r.qual, pat, 'public.hr_is_hr_staff(auth.uid())', 'gi') END;
    new_wc   := CASE WHEN r.with_check IS NULL THEN NULL
                     ELSE regexp_replace(r.with_check, pat, 'public.hr_is_hr_staff(auth.uid())', 'gi') END;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_wc IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_wc);
    END IF;

    RAISE NOTICE 'Rewriting policy % on %.%', r.policyname, r.schemaname, r.tablename;
    EXECUTE stmt;
  END LOOP;
END
$$;