CREATE OR REPLACE FUNCTION public.sync_user_role_id_to_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, NEW.role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.role_id IS NOT NULL
     AND OLD.role_id IS DISTINCT FROM NEW.role_id THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id AND role_id = OLD.role_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_user_role_id_to_user_roles_trg ON public.users;
CREATE TRIGGER sync_user_role_id_to_user_roles_trg
AFTER INSERT OR UPDATE OF role_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_id_to_user_roles();

INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, u.role_id
FROM public.users u
WHERE u.role_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = u.role_id
  );