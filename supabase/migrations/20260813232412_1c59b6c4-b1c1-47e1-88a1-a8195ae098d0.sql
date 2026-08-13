CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF NOT FOUND THEN
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
    SELECT
      child_ns.nspname AS table_schema,
      child.relname AS table_name,
      child_col.attname AS column_name,
      child_col.attnotnull AS is_not_null,
      con.confdeltype AS delete_action
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY child_key(attnum, ord) ON true
    JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = child_key.attnum
    WHERE con.contype = 'f'
      AND parent_ns.nspname = 'public'
      AND parent.relname = 'users'
      AND child_ns.nspname = 'public'
      AND cardinality(con.conkey) = 1
      AND child.relname <> 'user_roles'
    ORDER BY child.relname, child_col.attname
  LOOP
    IF _ref.delete_action = 'c' THEN
      _processed_refs := _processed_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':cascade');
    ELSIF _ref.delete_action = 'n' THEN
      _processed_refs := _processed_refs || jsonb_build_array(_ref.table_name || '.' || _ref.column_name || ':set_null');
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

  DELETE FROM public.users WHERE id = _tid;
  GET DIAGNOSTICS _deleted_user_rows = ROW_COUNT;

  IF _deleted_user_rows <> 1 THEN
    RAISE EXCEPTION 'ERP user deletion did not remove the target user';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'catalog_driven_cleanup_v3',
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

REVOKE ALL ON FUNCTION public.delete_user_with_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup(uuid) TO service_role;