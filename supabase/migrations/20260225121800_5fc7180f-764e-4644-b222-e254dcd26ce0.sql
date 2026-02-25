
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tid uuid := target_user_id;
BEGIN
  -- Terminal access: remove roles and profiles (revoke access)
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = _tid;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = _tid;
  DELETE FROM public.terminal_user_profiles WHERE user_id = _tid;
  DELETE FROM public.terminal_user_sessions WHERE user_id = _tid;

  -- ERP access: remove roles and preferences
  DELETE FROM public.user_roles WHERE user_id = _tid;
  DELETE FROM public.user_preferences WHERE user_id = _tid;
  DELETE FROM public.email_verification_tokens WHERE user_id = _tid;

  -- Nullify FK references in logs/audit (preserve usernames and history)
  UPDATE public.ad_action_logs SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id = _tid;
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.bank_cases SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.bank_cases SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.bank_cases SET resolved_by = NULL WHERE resolved_by = _tid;
  UPDATE public.bank_cases SET investigation_assigned_to = NULL WHERE investigation_assigned_to = _tid;
  UPDATE public.erp_product_conversions SET created_by = '00000000-0000-0000-0000-000000000000' WHERE created_by = _tid;
  UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = _tid;
  UPDATE public.account_investigations SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  UPDATE public.system_action_logs SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id = _tid;
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.terminal_order_assignments SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.kyc_approval_requests SET reviewed_by = NULL WHERE reviewed_by = _tid;
  UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = _tid;
  UPDATE public.ad_rest_timer SET started_by = NULL WHERE started_by = _tid;
  UPDATE public.employees SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.employees SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.employee_offboarding SET initiated_by = NULL WHERE initiated_by = _tid;
  UPDATE public.users SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.closed_bank_accounts SET closed_by = NULL WHERE closed_by = _tid;

  -- Finally delete the user record itself
  DELETE FROM public.users WHERE id = _tid;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
