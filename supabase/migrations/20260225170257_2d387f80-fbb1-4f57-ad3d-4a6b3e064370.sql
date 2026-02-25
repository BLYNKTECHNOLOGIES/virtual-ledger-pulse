DO $$
DECLARE
  v_role_id UUID;
  perm TEXT;
BEGIN
  FOR v_role_id IN SELECT id FROM p2p_terminal_roles WHERE name IN ('Admin', 'COO')
  LOOP
    FOR perm IN SELECT unnest(ARRAY[
      'terminal_assets_view', 'terminal_mpi_view', 'terminal_audit_logs_view',
      'terminal_kyc_view', 'terminal_kyc_manage', 'terminal_logs_view'
    ])
    LOOP
      INSERT INTO p2p_terminal_role_permissions (role_id, permission)
      VALUES (v_role_id, perm::terminal_permission)
      ON CONFLICT (role_id, permission) DO NOTHING;
    END LOOP;
  END LOOP;

  FOR v_role_id IN SELECT id FROM p2p_terminal_roles WHERE name IN ('Operations Manager', 'Team Lead')
  LOOP
    FOR perm IN SELECT unnest(ARRAY[
      'terminal_assets_view', 'terminal_mpi_view', 'terminal_audit_logs_view', 'terminal_logs_view'
    ])
    LOOP
      INSERT INTO p2p_terminal_role_permissions (role_id, permission)
      VALUES (v_role_id, perm::terminal_permission)
      ON CONFLICT (role_id, permission) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;