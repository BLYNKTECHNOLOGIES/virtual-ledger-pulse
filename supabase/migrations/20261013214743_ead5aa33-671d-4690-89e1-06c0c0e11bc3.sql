CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.hr_wf_is_current_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.hr_wf_is_manager(auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION private.hr_wf_is_current_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.hr_wf_is_current_manager() TO authenticated, service_role;

DO $$
DECLARE p record; q text; c text;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
           WHERE coalesce(qual,'')||coalesce(with_check,'') LIKE '%hr_wf_is_current_manager()%' LOOP
    q := replace(p.qual, 'hr_wf_is_current_manager()', 'private.hr_wf_is_current_manager()');
    c := replace(p.with_check, 'hr_wf_is_current_manager()', 'private.hr_wf_is_current_manager()');
    EXECUTE format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename)
      || CASE WHEN q IS NOT NULL THEN ' USING ('||q||')' ELSE '' END
      || CASE WHEN c IS NOT NULL THEN ' WITH CHECK ('||c||')' ELSE '' END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_remove_desk_group(p_seat uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.hr_wf_is_current_manager() THEN RAISE EXCEPTION 'Only HRMS managers can remove a desk group'; END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for removing this desk group'; END IF;
  UPDATE public.hr_seat_capacity
     SET is_active = false, notes = concat_ws(E'\n', nullif(notes, ''), 'Removed: ' || btrim(p_reason))
   WHERE id = p_seat AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That desk group is no longer active'; END IF;
END $function$;

DROP FUNCTION public.hr_wf_is_current_manager();