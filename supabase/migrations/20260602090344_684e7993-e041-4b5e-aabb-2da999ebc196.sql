-- Root cause: a search_path-hardening migration pinned these functions to
-- search_path = public, but crypt()/gen_salt() live in the extensions schema.
-- Fix: explicitly schema-qualify the pgcrypto calls AND widen search_path to
-- include extensions so hashing works regardless of qualification.

CREATE OR REPLACE FUNCTION public.create_user_with_password(_username text, _email text, _password text, _first_name text DEFAULT NULL, _last_name text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE new_user_id uuid;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'user_management_manage', 'create_user');

  INSERT INTO users (username, email, password_hash, first_name, last_name, phone, status)
  VALUES (_username, _email, extensions.crypt(_password, extensions.gen_salt('bf')), _first_name, _last_name, _phone, 'ACTIVE')
  RETURNING id INTO new_user_id;
  RETURN new_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_password(user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  PERFORM public.require_permission(auth.uid(), 'user_management_manage', 'update_user_password');

  UPDATE public.users SET password_hash = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = NOW() WHERE id = user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$function$;