
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  _tid text := p_user_id::text;
  _user_name text;
  _full_name text;
  _orig_email text;
  _caller_id uuid := auth.uid();
  _caller_can_full_delete boolean := false;
  _caller_can_hr_delete boolean := false;
  _target_is_protected boolean := false;
BEGIN
  IF _caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You must be logged in to delete users');
  END IF;

  IF _caller_id = p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You cannot delete your own account');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND lower(r.name) IN ('admin','super admin','super_admin')
  ) INTO _target_is_protected;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _caller_id AND lower(r.name) IN ('admin','super admin','super_admin')
  ) INTO _caller_can_full_delete;

  IF NOT _caller_can_full_delete THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = _caller_id AND rp.permission = 'user_management_manage'
    ) INTO _caller_can_full_delete;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _caller_id AND rp.permission = 'user_management_hr_manage'
  ) INTO _caller_can_hr_delete;

  IF NOT _caller_can_full_delete AND NOT _caller_can_hr_delete THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to delete users');
  END IF;

  IF _target_is_protected AND NOT _caller_can_full_delete THEN
    RETURN json_build_object('success', false, 'error', 'HR user management cannot delete Admin or Super Admin accounts');
  END IF;

  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), username, email), email
    INTO _full_name, _orig_email FROM public.users WHERE id = p_user_id;
  IF _full_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  _user_name := 'DELETED: ' || _full_name;

  -- Session / login / biometric surface
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  DELETE FROM public.terminal_webauthn_challenges WHERE user_id = p_user_id;
  DELETE FROM public.terminal_biometric_sessions WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_presence WHERE user_id = p_user_id;
  DELETE FROM public.terminal_internal_chat_reads WHERE user_id = p_user_id;
  DELETE FROM public.terminal_bypass_codes WHERE user_id = p_user_id OR generated_by = p_user_id;
  DELETE FROM public.terminal_notifications WHERE user_id = p_user_id OR related_user_id = p_user_id;

  -- Terminal assignments / mappings (stops future work being routed to this user)
  DELETE FROM public.terminal_user_exchange_mappings WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_size_range_mappings WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_supervisor_mappings WHERE user_id = p_user_id OR supervisor_id = p_user_id;
  DELETE FROM public.terminal_auto_reply_exclusions WHERE excluded_by = p_user_id;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = p_user_id;
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = p_user_id;
  DELETE FROM public.terminal_user_profiles WHERE user_id = p_user_id;
  UPDATE public.terminal_user_profiles SET reports_to = NULL WHERE reports_to = p_user_id;
  DELETE FROM public.terminal_order_assignments WHERE assigned_to = p_user_id;
  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
  DELETE FROM public.terminal_payer_assignments WHERE payer_user_id = p_user_id OR assigned_by = p_user_id;
  DELETE FROM public.terminal_operator_assignments WHERE operator_user_id = p_user_id;
  UPDATE public.terminal_operator_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
  DELETE FROM public.terminal_small_payment_manager_assignments WHERE manager_user_id = p_user_id;
  UPDATE public.terminal_small_payment_manager_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;

  -- Roles & preferences
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.user_preferences WHERE user_id = p_user_id;
  IF to_regclass('public.user_sidebar_preferences') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_sidebar_preferences WHERE user_id = $1' USING p_user_id;
  END IF;

  -- Employee / HR unlink (frees badge for reuse)
  UPDATE public.employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.hr_employees SET user_id = NULL WHERE user_id = p_user_id;

  -- Password reset trail (attached to the user identity)
  UPDATE public.password_reset_requests SET resolved_by = NULL WHERE resolved_by = p_user_id;
  DELETE FROM public.password_reset_requests WHERE user_id = p_user_id;

  -- MPI snapshots (session-scoped, safe to drop)
  DELETE FROM public.terminal_mpi_snapshots WHERE user_id = p_user_id;

  -- Best-effort: preserve original name on tables that carry a text mirror
  UPDATE public.erp_product_conversions SET created_by_name = COALESCE(created_by_name, _user_name) WHERE created_by = p_user_id;
  UPDATE public.erp_product_conversions SET approved_by_name = COALESCE(approved_by_name, _user_name) WHERE approved_by = p_user_id;
  UPDATE public.erp_product_conversions SET rejected_by_name = COALESCE(rejected_by_name, _user_name) WHERE rejected_by = p_user_id;
  UPDATE public.ad_action_logs SET user_name = _user_name WHERE user_id = _tid AND (user_name IS NULL OR user_name = '');
  UPDATE public.chat_message_senders SET username = _user_name WHERE user_id = _tid AND (username IS NULL OR username = '');
  UPDATE public.system_action_logs SET user_name = _user_name WHERE user_id = p_user_id AND (user_name IS NULL OR user_name = '');

  -- Anonymize the user row (SOFT DELETE). We keep the row so historical FKs
  -- continue to resolve to a readable "DELETED: <Original Name>" label
  -- everywhere in the ERP without having to backfill every table.
  UPDATE public.users
     SET first_name = 'DELETED',
         last_name = _full_name,
         username = 'deleted_' || _tid,
         email = 'deleted+' || _tid || '@erp.local',
         phone = NULL,
         password_hash = NULL,
         avatar_url = NULL,
         status = 'INACTIVE',
         email_verified = false,
         force_password_change = true,
         force_logout_at = now(),
         badge_id = NULL,
         role_id = NULL,
         department_id = NULL,
         position_id = NULL,
         account_locked_until = now() + interval '100 years',
         updated_at = now()
   WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'user_name', _user_name,
    'mode', 'soft_delete',
    'original_email', _orig_email
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$;
