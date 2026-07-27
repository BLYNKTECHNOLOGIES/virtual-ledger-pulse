CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tid uuid := target_user_id;
  _tid_text text := target_user_id::text;
  _actor uuid := auth.uid();
  _placeholder_uuid uuid := '00000000-0000-0000-0000-000000000000';
  _placeholder_text text := '00000000-0000-0000-0000-000000000000';
  _target_name text;
  _target_role_names text[] := '{}';
  _actor_allowed boolean := false;
  _tables_deleted int := 0;
  _refs_updated int := 0;
  _missing_refs jsonb := '[]'::jsonb;
BEGIN
  IF _tid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing target user id');
  END IF;

  -- Direct RPC calls must be authenticated and authorized. Internal SECURITY DEFINER
  -- jobs run with auth.uid() NULL and are allowed through the function ownership path.
  IF _actor IS NOT NULL THEN
    SELECT (
      public.has_role(_actor, 'Super Admin')
      OR public.has_role(_actor, 'Admin')
      OR public.user_has_permission(_actor, 'user_management_hr_manage'::public.app_permission)
    ) INTO _actor_allowed;

    IF NOT COALESCE(_actor_allowed, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to delete ERP users');
    END IF;

    IF _actor = _tid THEN
      RETURN jsonb_build_object('success', false, 'error', 'You cannot delete your own account');
    END IF;
  END IF;

  SELECT trim(concat_ws(' ', first_name, last_name))
  INTO _target_name
  FROM public.users
  WHERE id = _tid;

  SELECT COALESCE(array_agg(lower(r.name)), '{}')
  INTO _target_role_names
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = _tid;

  IF _actor IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(_target_role_names) role_name WHERE role_name IN ('super admin', 'super_admin'))
     AND NOT public.has_role(_actor, 'Super Admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can delete a Super Admin user');
  END IF;

  -- Delete access/session rows where those tables still exist.
  IF to_regclass('public.terminal_webauthn_credentials') IS NOT NULL THEN
    DELETE FROM public.terminal_webauthn_credentials WHERE user_id = _tid;
    GET DIAGNOSTICS _tables_deleted = ROW_COUNT;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_webauthn_credentials.user_id');
  END IF;

  IF to_regclass('public.terminal_biometric_sessions') IS NOT NULL THEN
    DELETE FROM public.terminal_biometric_sessions WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_biometric_sessions.user_id');
  END IF;

  IF to_regclass('public.p2p_terminal_user_roles') IS NOT NULL THEN
    DELETE FROM public.p2p_terminal_user_roles WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('p2p_terminal_user_roles.user_id');
  END IF;

  IF to_regclass('public.terminal_user_profiles') IS NOT NULL THEN
    DELETE FROM public.terminal_user_profiles WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_user_profiles.user_id');
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('user_roles.user_id');
  END IF;

  IF to_regclass('public.user_preferences') IS NOT NULL THEN
    DELETE FROM public.user_preferences WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('user_preferences.user_id');
  END IF;

  -- Legacy token tables were retired in this project; keep them optional.
  IF to_regclass('public.email_verification_tokens') IS NOT NULL THEN
    DELETE FROM public.email_verification_tokens WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('email_verification_tokens.user_id');
  END IF;

  IF to_regclass('public.password_reset_tokens') IS NOT NULL THEN
    DELETE FROM public.password_reset_tokens WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('password_reset_tokens.user_id');
  END IF;

  -- UUID user references: update only if table + column still exist.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_action_logs' AND column_name='user_id') THEN
    UPDATE public.system_action_logs SET user_id = _placeholder_uuid WHERE user_id = _tid;
    GET DIAGNOSTICS _refs_updated = ROW_COUNT;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('system_action_logs.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='erp_product_conversions' AND column_name='created_by') THEN
    UPDATE public.erp_product_conversions SET created_by = _placeholder_uuid WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('erp_product_conversions.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_transactions' AND column_name='created_by') THEN
    UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('bank_transactions.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='client_onboarding_approvals' AND column_name='reviewed_by') THEN
    UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('client_onboarding_approvals.reviewed_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='compliance_documents' AND column_name='uploaded_by') THEN
    UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('compliance_documents.uploaded_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='uploaded_by') THEN
    UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('documents.uploaded_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='erp_product_conversions' AND column_name='approved_by') THEN
    UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('erp_product_conversions.approved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='erp_product_conversions' AND column_name='rejected_by') THEN
    UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('erp_product_conversions.rejected_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='user_id') THEN
    UPDATE public.employees SET user_id = NULL WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('employees.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='approved_by') THEN
    UPDATE public.employees SET approved_by = NULL WHERE approved_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('employees.approved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_assets' AND column_name='assigned_to') THEN
    UPDATE public.hr_assets SET assigned_to = NULL WHERE assigned_to = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_assets.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_requests' AND column_name='approved_by') THEN
    UPDATE public.hr_leave_requests SET approved_by = NULL WHERE approved_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_leave_requests.approved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_notifications' AND column_name='user_id') THEN
    UPDATE public.hr_notifications SET user_id = NULL WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_notifications.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_helpdesk_tickets' AND column_name='assigned_to') THEN
    UPDATE public.hr_helpdesk_tickets SET assigned_to = NULL WHERE assigned_to = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_helpdesk_tickets.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='created_by') THEN
    UPDATE public.journal_entries SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('journal_entries.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kyc_approval_requests' AND column_name='created_by') THEN
    UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('kyc_approval_requests.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kyc_queries' AND column_name='created_by') THEN
    UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('kyc_queries.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='p2p_terminal_user_roles' AND column_name='assigned_by') THEN
    UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('p2p_terminal_user_roles.assigned_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pending_registrations' AND column_name='reviewed_by') THEN
    UPDATE public.pending_registrations SET reviewed_by = NULL WHERE reviewed_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('pending_registrations.reviewed_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pending_settlements' AND column_name='created_by') THEN
    UPDATE public.pending_settlements SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('pending_settlements.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_order_payment_splits' AND column_name='created_by') THEN
    UPDATE public.purchase_order_payment_splits SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('purchase_order_payment_splits.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_order_payments' AND column_name='created_by') THEN
    UPDATE public.purchase_order_payments SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('purchase_order_payments.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_order_reviews' AND column_name='created_by') THEN
    UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('purchase_order_reviews.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='created_by') THEN
    UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('purchase_orders.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rekyc_requests' AND column_name='reviewed_by') THEN
    UPDATE public.rekyc_requests SET reviewed_by = NULL WHERE reviewed_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('rekyc_requests.reviewed_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rekyc_requests' AND column_name='user_id') THEN
    UPDATE public.rekyc_requests SET user_id = NULL WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('rekyc_requests.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='risk_detection_logs' AND column_name='user_id') THEN
    UPDATE public.risk_detection_logs SET user_id = NULL WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('risk_detection_logs.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='risk_flags' AND column_name='resolved_by') THEN
    UPDATE public.risk_flags SET resolved_by = NULL WHERE resolved_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('risk_flags.resolved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='risk_flags' AND column_name='user_id') THEN
    UPDATE public.risk_flags SET user_id = NULL WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('risk_flags.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='created_by') THEN
    UPDATE public.sales_orders SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('sales_orders.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_adjustments' AND column_name='created_by') THEN
    UPDATE public.stock_adjustments SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('stock_adjustments.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_transactions' AND column_name='created_by') THEN
    UPDATE public.stock_transactions SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('stock_transactions.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='terminal_order_assignments' AND column_name='assigned_by') THEN
    UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_order_assignments.assigned_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='terminal_order_assignments' AND column_name='assigned_to') THEN
    UPDATE public.terminal_order_assignments SET assigned_to = NULL WHERE assigned_to = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_order_assignments.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='terminal_payer_assignments' AND column_name='assigned_by') THEN
    UPDATE public.terminal_payer_assignments SET assigned_by = NULL WHERE assigned_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_payer_assignments.assigned_by');
  END IF;

  -- Text user references.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_action_logs' AND column_name='user_id') THEN
    UPDATE public.ad_action_logs SET user_id = _placeholder_text WHERE user_id = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('ad_action_logs.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_message_senders' AND column_name='user_id') THEN
    UPDATE public.chat_message_senders SET user_id = _placeholder_text WHERE user_id = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('chat_message_senders.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='account_investigations' AND column_name='assigned_to') THEN
    UPDATE public.account_investigations SET assigned_to = NULL WHERE assigned_to = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('account_investigations.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_rest_timer' AND column_name='started_by') THEN
    UPDATE public.ad_rest_timer SET started_by = NULL WHERE started_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('ad_rest_timer.started_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_cases' AND column_name='created_by') THEN
    UPDATE public.bank_cases SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('bank_cases.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_cases' AND column_name='assigned_to') THEN
    UPDATE public.bank_cases SET assigned_to = NULL WHERE assigned_to = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('bank_cases.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_cases' AND column_name='resolved_by') THEN
    UPDATE public.bank_cases SET resolved_by = NULL WHERE resolved_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('bank_cases.resolved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_cases' AND column_name='investigation_assigned_to') THEN
    UPDATE public.bank_cases SET investigation_assigned_to = NULL WHERE investigation_assigned_to = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('bank_cases.investigation_assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='closed_bank_accounts' AND column_name='closed_by') THEN
    UPDATE public.closed_bank_accounts SET closed_by = NULL WHERE closed_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('closed_bank_accounts.closed_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_offboarding' AND column_name='initiated_by') THEN
    UPDATE public.employee_offboarding SET initiated_by = NULL WHERE initiated_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('employee_offboarding.initiated_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_announcements' AND column_name='created_by') THEN
    UPDATE public.hr_announcements SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_announcements.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_asset_assignments' AND column_name='assigned_by') THEN
    UPDATE public.hr_asset_assignments SET assigned_by = NULL WHERE assigned_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_asset_assignments.assigned_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_allocation_requests' AND column_name='approved_by') THEN
    UPDATE public.hr_leave_allocation_requests SET approved_by = NULL WHERE approved_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_leave_allocation_requests.approved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_allocation_requests' AND column_name='created_by') THEN
    UPDATE public.hr_leave_allocation_requests SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_leave_allocation_requests.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_offer_letters' AND column_name='created_by') THEN
    UPDATE public.hr_offer_letters SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_offer_letters.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_penalties' AND column_name='created_by') THEN
    UPDATE public.hr_penalties SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_penalties.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='investigation_approvals' AND column_name='approved_by') THEN
    UPDATE public.investigation_approvals SET approved_by = NULL WHERE approved_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('investigation_approvals.approved_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='investigation_updates' AND column_name='created_by') THEN
    UPDATE public.investigation_updates SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('investigation_updates.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lien_updates' AND column_name='created_by') THEN
    UPDATE public.lien_updates SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('lien_updates.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='p2p_auto_reply_rules' AND column_name='created_by') THEN
    UPDATE public.p2p_auto_reply_rules SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('p2p_auto_reply_rules.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='p2p_merchant_schedules' AND column_name='created_by') THEN
    UPDATE public.p2p_merchant_schedules SET created_by = NULL WHERE created_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('p2p_merchant_schedules.created_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='assigned_to') THEN
    UPDATE public.purchase_orders SET assigned_to = NULL WHERE assigned_to = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('purchase_orders.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='small_buys_sync' AND column_name='reviewed_by') THEN
    UPDATE public.small_buys_sync SET reviewed_by = NULL WHERE reviewed_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('small_buys_sync.reviewed_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='small_sales_sync' AND column_name='reviewed_by') THEN
    UPDATE public.small_sales_sync SET reviewed_by = NULL WHERE reviewed_by = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('small_sales_sync.reviewed_by');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='terminal_auto_assignment_log' AND column_name='assigned_to') THEN
    UPDATE public.terminal_auto_assignment_log SET assigned_to = NULL WHERE assigned_to = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_auto_assignment_log.assigned_to');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='terminal_mpi_snapshots' AND column_name='user_id') THEN
    UPDATE public.terminal_mpi_snapshots SET user_id = NULL WHERE user_id = _tid_text;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('terminal_mpi_snapshots.user_id');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='created_by') THEN
    UPDATE public.users SET created_by = NULL WHERE created_by = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('users.created_by');
  END IF;

  -- Employee self-service profile mapping should be unlinked too when present.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_employees' AND column_name='user_id') THEN
    UPDATE public.hr_employees SET user_id = NULL WHERE user_id = _tid;
  ELSE
    _missing_refs := _missing_refs || jsonb_build_array('hr_employees.user_id');
  END IF;

  DELETE FROM public.users WHERE id = _tid;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'schema_aware_cleanup',
    'user_name', NULLIF(_target_name, ''),
    'skipped_missing_refs', _missing_refs
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_with_cleanup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_with_cleanup(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup(uuid) TO service_role;