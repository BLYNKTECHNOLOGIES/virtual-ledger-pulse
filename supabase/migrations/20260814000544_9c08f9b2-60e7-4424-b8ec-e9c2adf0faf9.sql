CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tid uuid := target_user_id;
  _actor uuid := auth.uid();
  _target_name text;
  _target_role_names text[] := '{}';
  _actor_allowed boolean := false;
  _ref record;
  _affected integer := 0;
  _deleted_reference_rows integer := 0;
  _anonymized_reference_rows integer := 0;
  _deleted_user_rows integer := 0;
  _processed_refs jsonb := '[]'::jsonb;
  _existed boolean := false;
  _requires_ledger_tombstone boolean := false;
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

  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), true
  INTO _target_name, _existed
  FROM public.users
  WHERE id = _tid;

  IF NOT COALESCE(_existed, false)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _tid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ERP user not found');
  END IF;

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

  SELECT EXISTS (
    SELECT 1 FROM public.bank_transactions WHERE created_by = _tid
  ) INTO _requires_ledger_tombstone;

  UPDATE public.erp_product_conversions
  SET created_by_name = COALESCE(created_by_name, _target_name, 'Deleted user')
  WHERE created_by = _tid;

  UPDATE public.erp_product_conversions
  SET approved_by_name = COALESCE(approved_by_name, _target_name, 'Deleted user')
  WHERE approved_by = _tid;

  UPDATE public.erp_product_conversions
  SET rejected_by_name = COALESCE(rejected_by_name, _target_name, 'Deleted user')
  WHERE rejected_by = _tid;

  FOR _ref IN
    SELECT DISTINCT
      child_ns.nspname AS table_schema,
      child.relname AS table_name,
      child_col.attname AS column_name,
      child_col.attnotnull AS is_not_null,
      con.confdeltype AS delete_action,
      parent_ns.nspname AS parent_schema
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY child_key(attnum, ord) ON true
    JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = child_key.attnum
    WHERE con.contype = 'f'
      AND parent.relname = 'users'
      AND parent_ns.nspname IN ('public', 'auth')
      AND child_ns.nspname = 'public'
      AND cardinality(con.conkey) = 1
      AND child.relname <> 'user_roles'
      AND child.relname <> 'users'
    ORDER BY child.relname, child_col.attname, parent_ns.nspname
  LOOP
    -- A bank-ledger creator is part of the immutable canonical hash. Keep all
    -- public.user references attached to an anonymized, non-login tombstone.
    -- Auth-user references must still be cleared so auth.admin.deleteUser works.
    IF _requires_ledger_tombstone AND _ref.parent_schema = 'public' THEN
      _processed_refs := _processed_refs || jsonb_build_array(
        _ref.table_name || '.' || _ref.column_name || ':preserved_for_audit'
      );
      CONTINUE;
    END IF;

    IF _ref.delete_action = 'c' THEN
      EXECUTE format('DELETE FROM %I.%I WHERE %I = $1', _ref.table_schema, _ref.table_name, _ref.column_name) USING _tid;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _deleted_reference_rows := _deleted_reference_rows + _affected;
      _processed_refs := _processed_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':cascade_deleted:' || _affected);
    ELSIF _ref.is_not_null THEN
      EXECUTE format('DELETE FROM %I.%I WHERE %I = $1', _ref.table_schema, _ref.table_name, _ref.column_name) USING _tid;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _deleted_reference_rows := _deleted_reference_rows + _affected;
      _processed_refs := _processed_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':deleted:' || _affected);
    ELSE
      EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = $1', _ref.table_schema, _ref.table_name, _ref.column_name, _ref.column_name) USING _tid;
      GET DIAGNOSTICS _affected = ROW_COUNT;
      _anonymized_reference_rows := _anonymized_reference_rows + _affected;
      _processed_refs := _processed_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':anonymized:' || _affected);
    END IF;
  END LOOP;

  DELETE FROM public.user_roles WHERE user_id = _tid;
  GET DIAGNOSTICS _affected = ROW_COUNT;
  _deleted_reference_rows := _deleted_reference_rows + _affected;

  IF _requires_ledger_tombstone AND _existed THEN
    UPDATE public.users
    SET username = 'deleted_' || replace(_tid::text, '-', ''),
        email = 'deleted+' || replace(_tid::text, '-', '') || '@invalid.blynkex.local',
        password_hash = 'DELETED',
        first_name = 'DELETED:',
        last_name = COALESCE(_target_name, 'Unknown user'),
        phone = NULL,
        avatar_url = NULL,
        status = 'INACTIVE',
        email_verified = false,
        last_login = NULL,
        failed_login_attempts = 0,
        account_locked_until = now(),
        role_id = NULL,
        last_activity = NULL,
        force_logout_at = now(),
        badge_id = NULL,
        force_password_change = true,
        department_id = NULL,
        position_id = NULL,
        updated_at = now()
    WHERE id = _tid;
    GET DIAGNOSTICS _affected = ROW_COUNT;

    IF _affected <> 1 THEN
      RAISE EXCEPTION 'ERP user tombstone conversion did not update the target user';
    END IF;
  ELSE
    DELETE FROM public.users WHERE id = _tid;
    GET DIAGNOSTICS _deleted_user_rows = ROW_COUNT;

    IF _existed AND _deleted_user_rows <> 1 THEN
      RAISE EXCEPTION 'ERP user deletion did not remove the target user';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mode', CASE WHEN _requires_ledger_tombstone
      THEN 'immutable_ledger_tombstone_v5'
      ELSE 'catalog_driven_cleanup_v5'
    END,
    'user_name', _target_name,
    'anonymized_reference_rows', _anonymized_reference_rows,
    'deleted_reference_rows', _deleted_reference_rows,
    'deleted_user_rows', _deleted_user_rows,
    'processed_refs', _processed_refs
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_with_cleanup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup(uuid) TO service_role;