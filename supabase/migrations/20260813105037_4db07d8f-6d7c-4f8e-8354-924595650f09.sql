CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tid uuid := target_user_id;
  _tid_text text := target_user_id::text;
  _actor uuid := auth.uid();
  _target_name text;
  _target_role_names text[] := '{}';
  _actor_allowed boolean := false;
  _placeholder_uuid uuid := '00000000-0000-0000-0000-000000000000';
  _placeholder_text text := '00000000-0000-0000-0000-000000000000';
  _ref record;
  _col_type text;
  _col_nullable text;
  _affected int := 0;
  _deleted_access_rows int := 0;
  _updated_reference_rows int := 0;
  _deleted_notnull_rows int := 0;
  _deleted_user_rows int := 0;
  _skipped_missing_refs jsonb := '[]'::jsonb;
  _type_mismatch_refs jsonb := '[]'::jsonb;
  _notnull_deleted_refs jsonb := '[]'::jsonb;
BEGIN
  IF _tid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing target user id');
  END IF;

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

  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), '')
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

  -- Access/session rows: delete only the disposable access rows.
  FOR _ref IN
    SELECT * FROM (VALUES
      ('terminal_webauthn_credentials','user_id'),
      ('terminal_biometric_sessions','user_id'),
      ('p2p_terminal_user_roles','user_id'),
      ('terminal_user_profiles','user_id'),
      ('user_roles','user_id'),
      ('user_preferences','user_id'),
      ('email_verification_tokens','user_id'),
      ('password_reset_tokens','user_id')
    ) AS refs(table_name, column_name)
  LOOP
    SELECT c.udt_name INTO _col_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = _ref.table_name
      AND c.column_name = _ref.column_name;

    IF _col_type IS NULL THEN
      _skipped_missing_refs := _skipped_missing_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name);
    ELSIF _col_type = 'uuid' THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _ref.table_name, _ref.column_name) USING _tid;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _deleted_access_rows := _deleted_access_rows + _affected;
    ELSIF _col_type IN ('text', 'varchar', 'bpchar') THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _ref.table_name, _ref.column_name) USING _tid_text;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _deleted_access_rows := _deleted_access_rows + _affected;
    ELSE
      _type_mismatch_refs := _type_mismatch_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':' || _col_type);
    END IF;
  END LOOP;

  -- References to preserve as a deleted-user placeholder rather than nulling history.
  FOR _ref IN
    SELECT * FROM (VALUES
      ('system_action_logs','user_id'),
      ('erp_product_conversions','created_by'),
      ('ad_action_logs','user_id'),
      ('chat_message_senders','user_id')
    ) AS refs(table_name, column_name)
  LOOP
    SELECT c.udt_name INTO _col_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = _ref.table_name
      AND c.column_name = _ref.column_name;

    IF _col_type IS NULL THEN
      _skipped_missing_refs := _skipped_missing_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name);
    ELSIF _col_type = 'uuid' THEN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', _ref.table_name, _ref.column_name, _ref.column_name)
      USING _placeholder_uuid, _tid;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _updated_reference_rows := _updated_reference_rows + _affected;
    ELSIF _col_type IN ('text', 'varchar', 'bpchar') THEN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', _ref.table_name, _ref.column_name, _ref.column_name)
      USING _placeholder_text, _tid_text;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _updated_reference_rows := _updated_reference_rows + _affected;
    ELSE
      _type_mismatch_refs := _type_mismatch_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':' || _col_type);
    END IF;
  END LOOP;

  -- Business references: preserve records and remove the deleted user's linkage.
  -- When the column is NOT NULL the row cannot survive without a user, so it is deleted instead.
  FOR _ref IN
    SELECT * FROM (VALUES
      ('bank_transactions','created_by'),
      ('client_onboarding_approvals','reviewed_by'),
      ('compliance_documents','uploaded_by'),
      ('documents','uploaded_by'),
      ('erp_product_conversions','approved_by'),
      ('erp_product_conversions','rejected_by'),
      ('employees','user_id'),
      ('employees','approved_by'),
      ('hr_assets','assigned_to'),
      ('hr_leave_requests','approved_by'),
      ('hr_notifications','user_id'),
      ('hr_helpdesk_tickets','assigned_to'),
      ('journal_entries','created_by'),
      ('kyc_approval_requests','created_by'),
      ('kyc_queries','created_by'),
      ('p2p_terminal_user_roles','assigned_by'),
      ('pending_registrations','reviewed_by'),
      ('pending_settlements','created_by'),
      ('purchase_order_payment_splits','created_by'),
      ('purchase_order_payments','created_by'),
      ('purchase_order_reviews','created_by'),
      ('purchase_orders','created_by'),
      ('rekyc_requests','reviewed_by'),
      ('rekyc_requests','user_id'),
      ('risk_detection_logs','user_id'),
      ('risk_flags','resolved_by'),
      ('risk_flags','user_id'),
      ('sales_orders','created_by'),
      ('stock_adjustments','created_by'),
      ('stock_transactions','created_by'),
      ('terminal_order_assignments','assigned_by'),
      ('terminal_order_assignments','assigned_to'),
      ('terminal_payer_assignments','assigned_by'),
      ('account_investigations','assigned_to'),
      ('ad_rest_timer','started_by'),
      ('bank_cases','created_by'),
      ('bank_cases','assigned_to'),
      ('bank_cases','resolved_by'),
      ('bank_cases','investigation_assigned_to'),
      ('closed_bank_accounts','closed_by'),
      ('employee_offboarding','initiated_by'),
      ('hr_announcements','created_by'),
      ('hr_asset_assignments','assigned_by'),
      ('hr_leave_allocation_requests','approved_by'),
      ('hr_leave_allocation_requests','created_by'),
      ('hr_offer_letters','created_by'),
      ('hr_penalties','created_by'),
      ('investigation_approvals','approved_by'),
      ('investigation_updates','created_by'),
      ('lien_updates','created_by'),
      ('p2p_auto_reply_rules','created_by'),
      ('p2p_merchant_schedules','created_by'),
      ('purchase_orders','assigned_to'),
      ('small_buys_sync','reviewed_by'),
      ('small_sales_sync','reviewed_by'),
      ('terminal_auto_assignment_log','assigned_to'),
      ('terminal_mpi_snapshots','user_id'),
      ('hr_employees','user_id'),
      ('users','created_by')
    ) AS refs(table_name, column_name)
  LOOP
    SELECT c.udt_name, c.is_nullable INTO _col_type, _col_nullable
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = _ref.table_name
      AND c.column_name = _ref.column_name;

    IF _col_type IS NULL THEN
      _skipped_missing_refs := _skipped_missing_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name);
    ELSIF _col_type NOT IN ('uuid', 'text', 'varchar', 'bpchar') THEN
      _type_mismatch_refs := _type_mismatch_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':' || _col_type);
    ELSIF _col_nullable = 'NO' THEN
      IF _col_type = 'uuid' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _ref.table_name, _ref.column_name) USING _tid;
      ELSE
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _ref.table_name, _ref.column_name) USING _tid_text;
      END IF;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _deleted_notnull_rows := _deleted_notnull_rows + _affected;
      IF _affected > 0 THEN
        _notnull_deleted_refs := _notnull_deleted_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':' || _affected);
      END IF;
    ELSIF _col_type = 'uuid' THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', _ref.table_name, _ref.column_name, _ref.column_name) USING _tid;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _updated_reference_rows := _updated_reference_rows + _affected;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', _ref.table_name, _ref.column_name, _ref.column_name) USING _tid_text;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _updated_reference_rows := _updated_reference_rows + _affected;
    END IF;
  END LOOP;

  DELETE FROM public.users WHERE id = _tid;
  GET DIAGNOSTICS _deleted_user_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'typed_dynamic_cleanup_v2',
    'user_name', _target_name,
    'deleted_access_rows', _deleted_access_rows,
    'updated_reference_rows', _updated_reference_rows,
    'deleted_notnull_rows', _deleted_notnull_rows,
    'notnull_deleted_refs', _notnull_deleted_refs,
    'deleted_user_rows', _deleted_user_rows,
    'skipped_missing_refs', _skipped_missing_refs,
    'type_mismatch_refs', _type_mismatch_refs
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$;