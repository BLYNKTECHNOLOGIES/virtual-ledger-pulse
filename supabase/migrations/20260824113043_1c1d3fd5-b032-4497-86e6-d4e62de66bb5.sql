CREATE OR REPLACE FUNCTION public.terminal_revoke_all_access(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
  _total integer := 0;
  _detail jsonb := '[]'::jsonb;
  _t record;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing user id');
  END IF;

  FOR _t IN
    SELECT * FROM (VALUES
      ('p2p_terminal_user_roles','user_id'),
      ('terminal_webauthn_credentials','user_id'),
      ('terminal_webauthn_challenges','user_id'),
      ('terminal_biometric_sessions','user_id'),
      ('terminal_bypass_codes','user_id'),
      ('terminal_operator_assignments','operator_user_id'),
      ('terminal_payer_assignments','payer_user_id'),
      ('terminal_payer_order_locks','payer_user_id'),
      ('terminal_small_payment_manager_assignments','manager_user_id'),
      ('terminal_user_exchange_mappings','user_id'),
      ('terminal_user_size_range_mappings','user_id'),
      ('terminal_user_supervisor_mappings','user_id'),
      ('terminal_user_profiles','user_id'),
      ('terminal_user_presence','user_id'),
      ('terminal_internal_chat_reads','user_id')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = _t.tbl AND column_name = _t.col
    ) THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', _t.tbl, _t.col) USING _uid;
      GET DIAGNOSTICS _n = ROW_COUNT;
      _total := _total + _n;
      IF _n > 0 THEN
        _detail := _detail || jsonb_build_array(_t.tbl || ':' || _n);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'removed_rows', _total, 'detail', _detail);
END;
$$;

REVOKE ALL ON FUNCTION public.terminal_revoke_all_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_revoke_all_access(uuid) TO service_role;

-- Keep the existing catalog-driven cleanup body intact, but always purge
-- terminal access first (the ledger-tombstone path preserves public.users FKs
-- and was leaving terminal roles/assignments alive after ERP deletion).
ALTER FUNCTION public.delete_user_with_cleanup(uuid) RENAME TO delete_user_with_cleanup_core;

CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _terminal jsonb;
  _result jsonb;
BEGIN
  _terminal := public.terminal_revoke_all_access(target_user_id);
  _result := public.delete_user_with_cleanup_core(target_user_id);
  RETURN _result || jsonb_build_object('terminal_access_revoked', _terminal);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_with_cleanup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_user_with_cleanup_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_with_cleanup_core(uuid) TO service_role;