-- Phase 1c: Strict mutation block with GUC-gated created_by nullification bypass

CREATE OR REPLACE FUNCTION public.block_bank_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bypass text;
  v_changed_cols text[] := ARRAY[]::text[];
BEGIN
  BEGIN
    v_bypass := current_setting('app.bypass_bank_immutability', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.bank_ledger_tamper_log (operation, target_tx_id, old_payload, blocked, reason, attempted_by)
    VALUES ('DELETE', OLD.id, to_jsonb(OLD), true, 'DELETE on bank_transactions is forbidden — use reverse_bank_transaction RPC', auth.uid());
    RAISE EXCEPTION 'bank_transactions is append-only. Use reverse_bank_transaction(p_original_id, p_reason) RPC instead of DELETE.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.bank_account_id IS DISTINCT FROM NEW.bank_account_id THEN v_changed_cols := array_append(v_changed_cols, 'bank_account_id'); END IF;
    IF OLD.transaction_type IS DISTINCT FROM NEW.transaction_type THEN v_changed_cols := array_append(v_changed_cols, 'transaction_type'); END IF;
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN v_changed_cols := array_append(v_changed_cols, 'amount'); END IF;
    IF OLD.transaction_date IS DISTINCT FROM NEW.transaction_date THEN v_changed_cols := array_append(v_changed_cols, 'transaction_date'); END IF;
    IF OLD.reference_number IS DISTINCT FROM NEW.reference_number THEN v_changed_cols := array_append(v_changed_cols, 'reference_number'); END IF;
    IF OLD.balance_before IS DISTINCT FROM NEW.balance_before THEN v_changed_cols := array_append(v_changed_cols, 'balance_before'); END IF;
    IF OLD.balance_after IS DISTINCT FROM NEW.balance_after THEN v_changed_cols := array_append(v_changed_cols, 'balance_after'); END IF;
    IF OLD.sequence_no IS DISTINCT FROM NEW.sequence_no THEN v_changed_cols := array_append(v_changed_cols, 'sequence_no'); END IF;
    IF OLD.row_hash IS DISTINCT FROM NEW.row_hash THEN v_changed_cols := array_append(v_changed_cols, 'row_hash'); END IF;
    IF OLD.prev_hash IS DISTINCT FROM NEW.prev_hash THEN v_changed_cols := array_append(v_changed_cols, 'prev_hash'); END IF;
    IF OLD.reverses_transaction_id IS DISTINCT FROM NEW.reverses_transaction_id THEN v_changed_cols := array_append(v_changed_cols, 'reverses_transaction_id'); END IF;
    IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN v_changed_cols := array_append(v_changed_cols, 'client_id'); END IF;
    IF OLD.related_transaction_id IS DISTINCT FROM NEW.related_transaction_id THEN v_changed_cols := array_append(v_changed_cols, 'related_transaction_id'); END IF;
    IF OLD.related_account_name IS DISTINCT FROM NEW.related_account_name THEN v_changed_cols := array_append(v_changed_cols, 'related_account_name'); END IF;
    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN v_changed_cols := array_append(v_changed_cols, 'created_at'); END IF;
    IF OLD.id IS DISTINCT FROM NEW.id THEN v_changed_cols := array_append(v_changed_cols, 'id'); END IF;

    -- created_by is allowed only when GUC bypass is set, NEW value is NULL, and no other field is changing
    IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      IF v_bypass = 'true' AND NEW.created_by IS NULL AND array_length(v_changed_cols, 1) IS NULL THEN
        NULL;
      ELSE
        v_changed_cols := array_append(v_changed_cols, 'created_by');
      END IF;
    END IF;

    IF array_length(v_changed_cols, 1) IS NOT NULL THEN
      INSERT INTO public.bank_ledger_tamper_log (operation, target_tx_id, old_payload, new_payload, blocked, reason, attempted_by)
      VALUES (
        'UPDATE',
        OLD.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        true,
        'UPDATE on protected columns: ' || array_to_string(v_changed_cols, ', '),
        auth.uid()
      );
      RAISE EXCEPTION 'bank_transactions is append-only. Cannot modify columns: %. Use reverse_bank_transaction RPC + new INSERT.', array_to_string(v_changed_cols, ', ');
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Patch delete_user_with_cleanup to enable the GUC bypass briefly
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  UPDATE public.erp_product_conversions SET approved_by_name = _user_name WHERE approved_by = p_user_id;
  UPDATE public.erp_product_conversions SET rejected_by_name = _user_name WHERE rejected_by = p_user_id;

  UPDATE public.system_action_logs SET user_name = _user_name, user_id = NULL WHERE user_id = p_user_id;

  UPDATE public.ad_action_logs SET user_name = _user_name WHERE user_id = _tid AND (user_name IS NULL OR user_name = '');
  UPDATE public.ad_action_logs SET user_id = 'DELETED' WHERE user_id = _tid;

  UPDATE public.chat_message_senders SET username = _user_name WHERE user_id = _tid AND (username IS NULL OR username = '');
  UPDATE public.chat_message_senders SET user_id = 'DELETED' WHERE user_id = _tid;

  UPDATE public.terminal_auto_assignment_log SET assigned_to = 'DELETED:' || _user_name WHERE assigned_to = _tid;

  UPDATE public.terminal_mpi_snapshots SET user_id = NULL WHERE user_id = p_user_id;

  DELETE FROM public.terminal_payer_order_log WHERE payer_id = p_user_id;

  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
  UPDATE public.terminal_user_profiles SET reports_to = NULL WHERE reports_to = p_user_id;
  UPDATE public.wallet_transactions SET created_by = NULL WHERE created_by = p_user_id;

  -- Bank ledger: enable GUC bypass for the created_by nullification, then immediately disable
  PERFORM set_config('app.bypass_bank_immutability', 'true', true);
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = p_user_id;
  PERFORM set_config('app.bypass_bank_immutability', 'false', true);

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
$$;