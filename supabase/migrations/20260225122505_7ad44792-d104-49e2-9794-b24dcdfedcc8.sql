
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tid uuid := target_user_id;
  _tid_text text := target_user_id::text;
  _placeholder_uuid uuid := '00000000-0000-0000-0000-000000000000';
  _placeholder_text text := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- 1. Terminal access: revoke all access
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = _tid;
  DELETE FROM public.terminal_biometric_sessions WHERE user_id = _tid;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = _tid;
  DELETE FROM public.terminal_user_profiles WHERE user_id = _tid;

  -- 2. ERP access: revoke all access
  DELETE FROM public.user_roles WHERE user_id = _tid;
  DELETE FROM public.user_preferences WHERE user_id = _tid;
  DELETE FROM public.email_verification_tokens WHERE user_id = _tid;
  DELETE FROM public.password_reset_tokens WHERE user_id = _tid;

  -- 3. UUID columns - NOT NULL (use placeholder)
  UPDATE public.system_action_logs SET user_id = _placeholder_uuid WHERE user_id = _tid;
  UPDATE public.erp_product_conversions SET created_by = _placeholder_uuid WHERE created_by = _tid;

  -- 4. UUID columns - nullable (set NULL)
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = _tid;
  UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = _tid;
  UPDATE public.employees SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.employees SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.hr_assets SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.hr_leave_requests SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.hr_objectives SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.hr_notifications SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.hr_helpdesk_tickets SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.journal_entries SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.pending_registrations SET reviewed_by = NULL WHERE reviewed_by = _tid;
  UPDATE public.pending_settlements SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_payment_splits SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_payments SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.rekyc_requests SET reviewed_by = NULL WHERE reviewed_by = _tid;
  UPDATE public.rekyc_requests SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.risk_detection_logs SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.risk_flags SET resolved_by = NULL WHERE resolved_by = _tid;
  UPDATE public.risk_flags SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.sales_orders SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.stock_adjustments SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.stock_transactions SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.terminal_order_assignments SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.terminal_payer_assignments SET assigned_by = NULL WHERE assigned_by = _tid;

  -- 5. TEXT columns - NOT NULL (use placeholder)
  UPDATE public.ad_action_logs SET user_id = _placeholder_text WHERE user_id = _tid_text;
  UPDATE public.chat_message_senders SET user_id = _placeholder_text WHERE user_id = _tid_text;

  -- 6. TEXT columns - nullable (set NULL)
  UPDATE public.account_investigations SET assigned_to = NULL WHERE assigned_to = _tid_text;
  UPDATE public.ad_rest_timer SET started_by = NULL WHERE started_by = _tid_text;
  UPDATE public.bank_cases SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.bank_cases SET assigned_to = NULL WHERE assigned_to = _tid_text;
  UPDATE public.bank_cases SET resolved_by = NULL WHERE resolved_by = _tid_text;
  UPDATE public.bank_cases SET investigation_assigned_to = NULL WHERE investigation_assigned_to = _tid_text;
  UPDATE public.closed_bank_accounts SET closed_by = NULL WHERE closed_by = _tid_text;
  UPDATE public.employee_offboarding SET initiated_by = NULL WHERE initiated_by = _tid_text;
  UPDATE public.hr_announcements SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.hr_asset_assignments SET assigned_by = NULL WHERE assigned_by = _tid_text;
  UPDATE public.hr_leave_allocation_requests SET approved_by = NULL WHERE approved_by = _tid_text;
  UPDATE public.hr_leave_allocation_requests SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.hr_offer_letters SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.hr_penalties SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.investigation_approvals SET approved_by = NULL WHERE approved_by = _tid_text;
  UPDATE public.investigation_updates SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.lien_updates SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.p2p_auto_reply_rules SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.p2p_merchant_schedules SET created_by = NULL WHERE created_by = _tid_text;
  UPDATE public.purchase_orders SET assigned_to = NULL WHERE assigned_to = _tid_text;
  UPDATE public.small_buys_sync SET reviewed_by = NULL WHERE reviewed_by = _tid_text;
  UPDATE public.small_sales_sync SET reviewed_by = NULL WHERE reviewed_by = _tid_text;
  UPDATE public.terminal_auto_assignment_log SET assigned_to = NULL WHERE assigned_to = _tid_text;
  UPDATE public.terminal_mpi_snapshots SET user_id = NULL WHERE user_id = _tid_text;

  -- 7. Self-references in users table
  UPDATE public.users SET created_by = NULL WHERE created_by = _tid;

  -- 8. Finally delete the user record
  DELETE FROM public.users WHERE id = _tid;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
