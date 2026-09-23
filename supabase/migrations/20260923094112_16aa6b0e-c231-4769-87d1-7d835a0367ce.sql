
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'terminal_session_mode','terminal_write_allowed','terminal_ip_is_office',
        'create_terminal_biometric_session_v2','get_terminal_session_mode_for_token',
        'store_webauthn_credential_v2','issue_terminal_office_enrolment_code',
        'consume_terminal_office_enrolment_code','set_terminal_device_trust',
        'revoke_terminal_device','get_terminal_devices','terminal_guard_view_only',
        'terminal_guard_attach_all'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname IN (
      'terminal_session_mode','terminal_write_allowed','terminal_ip_is_office',
      'set_terminal_device_trust','revoke_terminal_device','get_terminal_devices',
      'issue_terminal_office_enrolment_code','get_terminal_session_mode_for_token'
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;
