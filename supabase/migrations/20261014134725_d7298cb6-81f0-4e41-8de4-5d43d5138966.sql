CREATE OR REPLACE FUNCTION public.um_trim_role_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  NEW.name := btrim(NEW.name);
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
  -- Reserved names first, so non-Super-Admins always get the built-in reason.
  IF v_uid IS NOT NULL AND NOT public.um_is_super_admin(v_uid) THEN
    IF public.um_is_reserved_role_name(NEW.name) THEN
      RAISE EXCEPTION 'This name belongs to a built-in role. Only a Super Admin can use it.';
    END IF;
    IF TG_OP = 'UPDATE' AND public.um_is_reserved_role_name(OLD.name) THEN
      RAISE EXCEPTION 'This is a built-in role. Only a Super Admin can rename it.';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.roles r WHERE lower(btrim(r.name)) = lower(NEW.name) AND r.id <> NEW.id) THEN
    RAISE EXCEPTION 'A role named "%" already exists', NEW.name USING ERRCODE = '23505';
  END IF;
  -- A built-in name variant (e.g. SUPER_ADMIN next to Super Admin) is never allowed twice, even for Super Admin.
  IF public.um_is_reserved_role_name(NEW.name) AND EXISTS (
       SELECT 1 FROM public.roles r WHERE public.um_role_name_key(r.name) = public.um_role_name_key(NEW.name) AND r.id <> NEW.id) THEN
    RAISE EXCEPTION 'A built-in role with this name already exists' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.um_trim_role_name() FROM PUBLIC, anon, authenticated;