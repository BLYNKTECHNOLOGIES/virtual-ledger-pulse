CREATE OR REPLACE FUNCTION public.um_role_name_key(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public
AS $$ SELECT regexp_replace(lower(coalesce(p,'')), '[\s_]+', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.um_is_reserved_role_name(p text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public
AS $$ SELECT public.um_role_name_key(p) = ANY (ARRAY['superadmin','admin','hrmanager','hr','coo','auditor']) $$;

CREATE UNIQUE INDEX IF NOT EXISTS roles_name_ci_unique ON public.roles (lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.um_trim_role_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  NEW.name := btrim(NEW.name);
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.roles r WHERE lower(btrim(r.name)) = lower(NEW.name) AND r.id <> NEW.id) THEN
    RAISE EXCEPTION 'A role named "%" already exists', NEW.name USING ERRCODE = '23505';
  END IF;
  -- Service/maintenance writes (no signed-in caller) are not restricted.
  IF v_uid IS NULL OR public.um_is_super_admin(v_uid) THEN RETURN NEW; END IF;
  IF public.um_is_reserved_role_name(NEW.name) THEN
    RAISE EXCEPTION 'This name belongs to a built-in role. Only a Super Admin can use it.';
  END IF;
  IF TG_OP = 'UPDATE' AND public.um_is_reserved_role_name(OLD.name) THEN
    RAISE EXCEPTION 'This is a built-in role. Only a Super Admin can rename it.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_um_trim_role_name ON public.roles;
DROP TRIGGER IF EXISTS um_trim_role_name ON public.roles;
CREATE TRIGGER trg_um_trim_role_name BEFORE INSERT OR UPDATE OF name ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.um_trim_role_name();