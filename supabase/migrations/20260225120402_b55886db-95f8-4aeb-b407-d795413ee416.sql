DROP FUNCTION IF EXISTS public.delete_user_with_cleanup(uuid);

CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_msg text;
BEGIN
  -- Terminal-related data
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = target_user_id;
  DELETE FROM public.terminal_webauthn_challenges WHERE user_id = target_user_id;
  DELETE FROM public.terminal_biometric_sessions WHERE user_id = target_user_id;
  
  -- Handle assigned_by references in terminal roles
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = target_user_id;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = target_user_id;
  
  DELETE FROM public.terminal_user_profiles WHERE user_id = target_user_id;
  DELETE FROM public.terminal_user_profiles WHERE reports_to = target_user_id;
  DELETE FROM public.terminal_user_exchange_mappings WHERE user_id = target_user_id;
  DELETE FROM public.terminal_user_size_range_mappings WHERE user_id = target_user_id;
  DELETE FROM public.terminal_user_supervisor_mappings WHERE user_id = target_user_id;
  DELETE FROM public.terminal_user_supervisor_mappings WHERE supervisor_id = target_user_id;
  DELETE FROM public.terminal_order_assignments WHERE assigned_to = target_user_id;
  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = target_user_id;
  DELETE FROM public.terminal_payer_assignments WHERE payer_user_id = target_user_id;
  UPDATE public.terminal_payer_assignments SET assigned_by = NULL WHERE assigned_by = target_user_id;
  UPDATE public.terminal_assignment_audit_logs SET performed_by = NULL WHERE performed_by = target_user_id;
  UPDATE public.terminal_assignment_audit_logs SET target_user_id = NULL WHERE target_user_id = target_user_id;
  UPDATE public.terminal_auto_reply_exclusions SET excluded_by = NULL WHERE excluded_by = target_user_id;
  UPDATE public.terminal_payer_order_log SET payer_id = NULL WHERE payer_id = target_user_id;

  -- User core tables
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  DELETE FROM public.user_preferences WHERE user_id = target_user_id;
  DELETE FROM public.user_activity_log WHERE user_id = target_user_id;
  DELETE FROM public.password_reset_tokens WHERE user_id = target_user_id;
  DELETE FROM public.email_verification_tokens WHERE user_id = target_user_id;

  -- Nullify FK references in other tables
  UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.sales_orders SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.stock_transactions SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.journal_entries SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.wallet_transactions SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.erp_product_conversions SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = target_user_id;
  UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = target_user_id;
  UPDATE public.tds_records SET paid_by = NULL WHERE paid_by = target_user_id;
  UPDATE public.payment_gateway_settlements SET settled_by = NULL WHERE settled_by = target_user_id;
  UPDATE public.payment_gateway_settlements SET reversed_by = NULL WHERE reversed_by = target_user_id;
  UPDATE public.risk_flags SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.risk_flags SET resolved_by = NULL WHERE resolved_by = target_user_id;
  UPDATE public.rekyc_requests SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.rekyc_requests SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  UPDATE public.risk_detection_logs SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = target_user_id;
  UPDATE public.purchase_order_payments SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.purchase_order_reviews SET read_by = NULL WHERE read_by = target_user_id;
  UPDATE public.purchase_action_timings SET actor_user_id = NULL WHERE actor_user_id = target_user_id;
  UPDATE public.purchase_order_payment_splits SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.employees SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.hr_employees SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.users SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.pending_registrations SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  UPDATE public.ad_action_logs SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id = target_user_id;
  UPDATE public.ad_payment_methods SET created_by_user_id = NULL WHERE created_by_user_id = target_user_id;
  UPDATE public.ad_rest_timer SET started_by = NULL WHERE started_by = target_user_id;
  UPDATE public.bank_cases SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.bank_cases SET resolved_by = NULL WHERE resolved_by = target_user_id;
  UPDATE public.bank_cases SET assigned_to = NULL WHERE assigned_to = target_user_id;
  UPDATE public.bank_cases SET investigation_assigned_to = NULL WHERE investigation_assigned_to = target_user_id;
  UPDATE public.closed_bank_accounts SET closed_by = NULL WHERE closed_by = target_user_id;
  UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = target_user_id;
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = target_user_id;
  UPDATE public.employee_offboarding SET initiated_by = NULL WHERE initiated_by = target_user_id;
  UPDATE public.erp_action_queue SET processed_by = NULL WHERE processed_by = target_user_id;
  UPDATE public.hr_announcements SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.hr_asset_assignments SET assigned_by = NULL WHERE assigned_by = target_user_id;
  UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  UPDATE public.clients SET assigned_operator = NULL WHERE assigned_operator = target_user_id;
  UPDATE public.counterparty_contact_records SET collected_by = NULL WHERE collected_by = target_user_id;
  UPDATE public.counterparty_pan_records SET collected_by = NULL WHERE collected_by = target_user_id;
  DELETE FROM public.chat_message_senders WHERE user_id = target_user_id;

  -- Finally delete the user
  DELETE FROM public.users WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object('success', false, 'error', v_error_msg);
END;
$$;