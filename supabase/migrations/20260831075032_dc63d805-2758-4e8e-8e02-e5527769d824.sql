CREATE OR REPLACE FUNCTION public.delete_all_user_webauthn_credentials(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (
       auth.uid() <> p_user_id
       AND NOT public.has_role(auth.uid(), 'Super Admin')
       AND NOT public.has_role(auth.uid(), 'Admin')
       AND NOT public.has_terminal_permission(auth.uid(), 'terminal_users_manage')
     ) THEN
    RAISE EXCEPTION 'Permission denied: terminal_users_manage required to reset biometric registration';
  END IF;

  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  UPDATE public.terminal_biometric_sessions SET is_active = false WHERE user_id = p_user_id;
END;
$function$;