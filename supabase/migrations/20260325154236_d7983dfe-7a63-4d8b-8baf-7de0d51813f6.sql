-- Enforce reviewer attribution for sales sync approvals/rejections
CREATE OR REPLACE FUNCTION public.enforce_sales_sync_review_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sync_status IN ('approved', 'rejected') THEN
    IF NEW.reviewed_by IS NULL OR btrim(NEW.reviewed_by) = '' THEN
      RAISE EXCEPTION 'reviewed_by is required when % is %', TG_TABLE_NAME, NEW.sync_status;
    END IF;

    IF NEW.reviewed_at IS NULL THEN
      NEW.reviewed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_terminal_sales_sync_review_actor ON public.terminal_sales_sync;
CREATE TRIGGER trg_enforce_terminal_sales_sync_review_actor
BEFORE INSERT OR UPDATE OF sync_status, reviewed_by, reviewed_at
ON public.terminal_sales_sync
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_sync_review_actor();

DROP TRIGGER IF EXISTS trg_enforce_small_sales_sync_review_actor ON public.small_sales_sync;
CREATE TRIGGER trg_enforce_small_sales_sync_review_actor
BEFORE INSERT OR UPDATE OF sync_status, reviewed_by, reviewed_at
ON public.small_sales_sync
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_sync_review_actor();

-- Preserve reviewer audit attribution on user deletion instead of nulling it
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tid text := p_user_id::text;
  _user_name text;
  _full_name text;
BEGIN
  -- Resolve user display name BEFORE deleting
  SELECT COALESCE(
    NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''),
    username,
    email
  ) INTO _full_name
  FROM public.users WHERE id = p_user_id;

  IF _full_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  _user_name := _full_name || ' [deleted]';

  -- ============================================
  -- 1. DELETE records that are ONLY user-config (no business value)
  -- ============================================
  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  DELETE FROM public.terminal_webauthn_challenges WHERE user_id = p_user_id;
  DELETE FROM public.terminal_biometric_sessions WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_exchange_mappings WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_size_range_mappings WHERE user_id = p_user_id;
  DELETE FROM public.terminal_auto_reply_exclusions WHERE excluded_by = p_user_id;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_profiles WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.user_preferences WHERE user_id = p_user_id;
  DELETE FROM public.email_verification_tokens WHERE user_id = p_user_id;
  DELETE FROM public.password_reset_tokens WHERE user_id = p_user_id;
  DELETE FROM public.terminal_order_assignments WHERE assigned_to = p_user_id;
  DELETE FROM public.terminal_payer_assignments WHERE payer_user_id = p_user_id OR assigned_by = p_user_id;
  DELETE FROM public.terminal_assignment_audit_logs WHERE performed_by = p_user_id OR target_user_id = p_user_id;

  -- ============================================
  -- 2. PRESERVE business/audit records: stamp user name, then NULL the FK
  -- ============================================

  -- erp_product_conversions (CRITICAL financial data - NEVER delete)
  UPDATE public.erp_product_conversions SET created_by_name = _user_name, created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = p_user_id;

  -- system_action_logs (audit trail - NEVER delete)
  UPDATE public.system_action_logs SET user_name = _user_name, user_id = NULL WHERE user_id = p_user_id;

  -- ad_action_logs (already has user_name column)
  UPDATE public.ad_action_logs SET user_name = _user_name, user_id = _tid WHERE user_id = _tid AND (user_name IS NULL OR user_name = '');
  -- Now we can safely null the user_id since name is preserved
  -- Actually ad_action_logs.user_id is text, keep it but mark deleted
  UPDATE public.ad_action_logs SET user_id = 'DELETED' WHERE user_id = _tid;

  -- chat_message_senders (has username column, preserve it)
  UPDATE public.chat_message_senders SET username = _user_name WHERE user_id = _tid AND (username IS NULL OR username = '');
  UPDATE public.chat_message_senders SET user_id = 'DELETED' WHERE user_id = _tid;

  -- terminal logs (text user_id)
  UPDATE public.terminal_auto_assignment_log SET assigned_to = 'DELETED:' || _user_name WHERE assigned_to = _tid;
  UPDATE public.terminal_mpi_snapshots SET user_id = 'DELETED' WHERE user_id = _tid;
  DELETE FROM public.terminal_payer_order_log WHERE payer_id = p_user_id;

  -- ============================================
  -- 3. Nullable UUID columns → NULL (preserving existing patterns)
  -- ============================================
  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
  UPDATE public.terminal_user_profiles SET reports_to = NULL WHERE reports_to = p_user_id;
  UPDATE public.wallet_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_payment_splits SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_reviews SET read_by = NULL WHERE read_by = p_user_id;
  UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = p_user_id;
  UPDATE public.purchase_action_timings SET actor_user_id = NULL WHERE actor_user_id = p_user_id;
  UPDATE public.sales_orders SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.stock_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.journal_entries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.rekyc_requests SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
  UPDATE public.rekyc_requests SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
  UPDATE public.risk_detection_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.risk_flags SET resolved_by = NULL WHERE resolved_by = p_user_id;
  UPDATE public.risk_flags SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.payment_gateway_settlements SET settled_by = NULL WHERE settled_by = p_user_id;
  UPDATE public.payment_gateway_settlements SET reversed_by = NULL WHERE reversed_by = p_user_id;
  UPDATE public.tds_records SET paid_by = NULL WHERE paid_by = p_user_id;
  UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE public.hr_employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.bank_accounts SET dormant_by = NULL WHERE dormant_by = p_user_id;
  UPDATE public.user_activity_log SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.users SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = p_user_id;

  -- Nullable TEXT columns → preserve reviewer audit stamp where possible
  UPDATE public.ad_rest_timer SET started_by = NULL WHERE started_by = _tid;
  UPDATE public.closed_bank_accounts SET closed_by = NULL WHERE closed_by = _tid;
  UPDATE public.employee_offboarding SET initiated_by = NULL WHERE initiated_by = _tid;
  UPDATE public.account_investigations SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.bank_cases SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.bank_cases SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.bank_cases SET resolved_by = NULL WHERE resolved_by = _tid;
  UPDATE public.hr_announcements SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.hr_asset_assignments SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.hr_leave_allocation_requests SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.hr_leave_allocation_requests SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.hr_offer_letters SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.hr_penalties SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.investigation_approvals SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.investigation_updates SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.lien_updates SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.p2p_auto_reply_rules SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.p2p_merchant_schedules SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_orders SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.small_buys_sync SET reviewed_by = 'DELETED:' || _user_name WHERE reviewed_by = _tid;
  UPDATE public.small_sales_sync SET reviewed_by = 'DELETED:' || _user_name WHERE reviewed_by = _tid;
  UPDATE public.terminal_sales_sync SET reviewed_by = 'DELETED:' || _user_name WHERE reviewed_by = _tid;
  UPDATE public.user_roles SET assigned_by = NULL WHERE assigned_by = _tid;

  -- Finally delete the user
  DELETE FROM public.users WHERE id = p_user_id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;