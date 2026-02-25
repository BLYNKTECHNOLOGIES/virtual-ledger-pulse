
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tid uuid := target_user_id;
  _placeholder uuid := '00000000-0000-0000-0000-000000000000';
  _tid_text text := target_user_id::text;
  _placeholder_text text := '00000000-0000-0000-0000-000000000000';
BEGIN
  /*
   * COMPLETE cleanup based on pg_constraint FK scan.
   * Strategy: DELETE owned records, NULLIFY or PLACEHOLDER audit/log references.
   */

  -- ===== DELETE: Access & session records (owned by user) =====
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = _tid;
  DELETE FROM public.terminal_webauthn_challenges WHERE user_id = _tid;
  DELETE FROM public.terminal_biometric_sessions WHERE user_id = _tid;
  DELETE FROM public.terminal_user_exchange_mappings WHERE user_id = _tid;
  DELETE FROM public.terminal_user_size_range_mappings WHERE user_id = _tid;
  DELETE FROM public.terminal_auto_reply_exclusions WHERE excluded_by = _tid;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = _tid;
  DELETE FROM public.terminal_user_profiles WHERE user_id = _tid;
  DELETE FROM public.user_roles WHERE user_id = _tid;
  DELETE FROM public.user_preferences WHERE user_id = _tid;
  DELETE FROM public.email_verification_tokens WHERE user_id = _tid;
  DELETE FROM public.password_reset_tokens WHERE user_id = _tid;

  -- ===== NULLIFY/PLACEHOLDER: UUID FK columns (NOT NULL → placeholder, nullable → NULL) =====

  -- terminal_assignment_audit_logs: performed_by NOT NULL, target_user_id NOT NULL
  UPDATE public.terminal_assignment_audit_logs SET performed_by = _placeholder WHERE performed_by = _tid;
  UPDATE public.terminal_assignment_audit_logs SET target_user_id = _placeholder WHERE target_user_id = _tid;

  -- terminal_order_assignments: assigned_to NOT NULL, assigned_by nullable
  UPDATE public.terminal_order_assignments SET assigned_to = _placeholder WHERE assigned_to = _tid;
  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = _tid;

  -- terminal_payer_assignments: payer_user_id NOT NULL, assigned_by NOT NULL
  UPDATE public.terminal_payer_assignments SET payer_user_id = _placeholder WHERE payer_user_id = _tid;
  UPDATE public.terminal_payer_assignments SET assigned_by = _placeholder WHERE assigned_by = _tid;

  -- terminal_payer_order_log: payer_id NOT NULL
  UPDATE public.terminal_payer_order_log SET payer_id = _placeholder WHERE payer_id = _tid;

  -- erp_product_conversions: created_by NOT NULL, approved_by nullable, rejected_by nullable
  UPDATE public.erp_product_conversions SET created_by = _placeholder WHERE created_by = _tid;
  UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = _tid;

  -- wallet_transactions: created_by nullable
  UPDATE public.wallet_transactions SET created_by = NULL WHERE created_by = _tid;

  -- bank_transactions: created_by nullable
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = _tid;

  -- system_action_logs: user_id NOT NULL (uuid)
  UPDATE public.system_action_logs SET user_id = _placeholder WHERE user_id = _tid;

  -- purchase tables (all nullable)
  UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_payments SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_payment_splits SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_order_reviews SET read_by = NULL WHERE read_by = _tid;
  UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = _tid;
  UPDATE public.purchase_action_timings SET actor_user_id = NULL WHERE actor_user_id = _tid;

  -- sales, stock, journal
  UPDATE public.sales_orders SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.stock_transactions SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.journal_entries SET created_by = NULL WHERE created_by = _tid;

  -- KYC & compliance
  UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.rekyc_requests SET reviewed_by = NULL WHERE reviewed_by = _tid;
  UPDATE public.rekyc_requests SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = _tid;

  -- risk
  UPDATE public.risk_detection_logs SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.risk_flags SET resolved_by = NULL WHERE resolved_by = _tid;
  UPDATE public.risk_flags SET user_id = NULL WHERE user_id = _tid;

  -- payment gateway
  UPDATE public.payment_gateway_settlements SET settled_by = NULL WHERE settled_by = _tid;
  UPDATE public.payment_gateway_settlements SET reversed_by = NULL WHERE reversed_by = _tid;

  -- TDS
  UPDATE public.tds_records SET paid_by = NULL WHERE paid_by = _tid;

  -- documents
  UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = _tid;

  -- HR
  UPDATE public.hr_employees SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.employees SET user_id = NULL WHERE user_id = _tid;
  UPDATE public.employees SET approved_by = NULL WHERE approved_by = _tid;

  -- user activity log
  UPDATE public.user_activity_log SET user_id = NULL WHERE user_id = _tid;

  -- p2p_terminal_user_roles assigned_by (already deleted user_id rows above)
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = _tid;

  -- terminal_user_profiles reports_to
  UPDATE public.terminal_user_profiles SET reports_to = NULL WHERE reports_to = _tid;

  -- self-reference
  UPDATE public.users SET created_by = NULL WHERE created_by = _tid;

  -- ===== TEXT-typed columns (no FK constraints but may exist) =====
  UPDATE public.ad_action_logs SET user_id = _placeholder_text WHERE user_id = _tid_text;
  UPDATE public.chat_message_senders SET user_id = _placeholder_text WHERE user_id = _tid_text;
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

  -- ===== FINALLY: Delete the user =====
  DELETE FROM public.users WHERE id = _tid;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
