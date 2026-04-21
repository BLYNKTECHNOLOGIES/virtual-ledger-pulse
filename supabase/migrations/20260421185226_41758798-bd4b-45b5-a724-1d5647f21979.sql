
-- 1. Add name preservation columns to erp_product_conversions (consistent with created_by_name pattern)
ALTER TABLE public.erp_product_conversions
  ADD COLUMN IF NOT EXISTS approved_by_name text,
  ADD COLUMN IF NOT EXISTS rejected_by_name text;

-- 2. Fix delete_user_with_cleanup to preserve approver/rejecter identity instead of nulling FK
--    (which violated validate_conversion_approval trigger when status was APPROVED/REJECTED)
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
  PERFORM public.require_permission(auth.uid(), 'user_management_manage', 'delete_user');
  PERFORM public.require_permission(auth.uid(), 'erp_destructive', 'delete_user');

  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), username, email) INTO _full_name FROM public.users WHERE id = p_user_id;
  IF _full_name IS NULL THEN RETURN json_build_object('success', false, 'error', 'User not found'); END IF;
  _user_name := _full_name || ' [deleted]';

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
  DELETE FROM public.terminal_order_assignments WHERE assigned_to = p_user_id;
  DELETE FROM public.terminal_payer_assignments WHERE payer_user_id = p_user_id OR assigned_by = p_user_id;
  DELETE FROM public.terminal_assignment_audit_logs WHERE performed_by = p_user_id OR target_user_id = p_user_id;

  UPDATE public.erp_product_conversions SET created_by_name = _user_name, created_by = NULL WHERE created_by = p_user_id;
  -- FIX: preserve approver/rejecter identity (validate_conversion_approval trigger requires approved_by NOT NULL when status=APPROVED)
  UPDATE public.erp_product_conversions SET approved_by_name = _user_name WHERE approved_by = p_user_id;
  UPDATE public.erp_product_conversions SET rejected_by_name = _user_name WHERE rejected_by = p_user_id;

  UPDATE public.system_action_logs SET user_name = _user_name, user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.ad_action_logs SET user_name = _user_name, user_id = _tid WHERE user_id = _tid AND (user_name IS NULL OR user_name = '');
  UPDATE public.ad_action_logs SET user_id = 'DELETED' WHERE user_id = _tid;
  UPDATE public.chat_message_senders SET username = _user_name WHERE user_id = _tid AND (username IS NULL OR username = '');
  UPDATE public.chat_message_senders SET user_id = 'DELETED' WHERE user_id = _tid;
  UPDATE public.terminal_auto_assignment_log SET assigned_to = 'DELETED:' || _user_name WHERE assigned_to = _tid;
  UPDATE public.terminal_mpi_snapshots SET user_id = 'DELETED' WHERE user_id = _tid;
  DELETE FROM public.terminal_payer_order_log WHERE payer_id = p_user_id;

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

  DELETE FROM public.users WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'user_name', _user_name);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;
