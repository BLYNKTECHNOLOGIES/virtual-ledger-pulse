-- Stage 2: Expand legacy permissions to new granular set for each role
-- This uses a DO block to insert new permissions for existing roles based on their old permissions

DO $$
DECLARE
  r RECORD;
  v_role_id UUID;
  v_has_perm BOOLEAN;
BEGIN
  -- For each role, expand old permissions to new granular ones
  FOR r IN SELECT id, name, hierarchy_level FROM p2p_terminal_roles LOOP
    v_role_id := r.id;

    -- === ORDERS expansion ===
    -- If role has terminal_orders_manage, grant new order permissions
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_orders_manage') INTO v_has_perm;
    IF v_has_perm THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_orders_chat'),
        (v_role_id, 'terminal_orders_escalate')
      ON CONFLICT DO NOTHING;
      -- Only higher-level roles get sync_approve, export, resolve_escalation
      IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 2 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_orders_sync_approve'),
          (v_role_id, 'terminal_orders_export'),
          (v_role_id, 'terminal_orders_resolve_escalation')
        ON CONFLICT DO NOTHING;
      ELSIF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 3 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_orders_export'),
          (v_role_id, 'terminal_orders_resolve_escalation')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    -- Operators get chat and escalate from orders_actions
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_orders_actions') INTO v_has_perm;
    IF v_has_perm THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_orders_chat'),
        (v_role_id, 'terminal_orders_escalate')
      ON CONFLICT DO NOTHING;
    END IF;

    -- === AUTOMATION expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_automation_manage') INTO v_has_perm;
    IF v_has_perm THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_pricing_view'),
        (v_role_id, 'terminal_pricing_manage'),
        (v_role_id, 'terminal_pricing_toggle'),
        (v_role_id, 'terminal_autoreply_view'),
        (v_role_id, 'terminal_autoreply_manage'),
        (v_role_id, 'terminal_autoreply_toggle'),
        (v_role_id, 'terminal_autopay_view'),
        (v_role_id, 'terminal_autopay_toggle')
      ON CONFLICT DO NOTHING;
      -- Higher levels get more
      IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 1 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_autopay_configure'),
          (v_role_id, 'terminal_broadcasts_create'),
          (v_role_id, 'terminal_broadcasts_manage')
        ON CONFLICT DO NOTHING;
      ELSIF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 2 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_autopay_configure'),
          (v_role_id, 'terminal_broadcasts_create')
        ON CONFLICT DO NOTHING;
      ELSIF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 3 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_broadcasts_create')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    -- automation_view only
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_automation_view') INTO v_has_perm;
    IF v_has_perm THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_pricing_view'),
        (v_role_id, 'terminal_autopay_view'),
        (v_role_id, 'terminal_autoreply_view')
      ON CONFLICT DO NOTHING;
    END IF;

    -- === ADS expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_ads_manage') INTO v_has_perm;
    IF v_has_perm THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_ads_toggle')
      ON CONFLICT DO NOTHING;
      IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 3 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_ads_rest_timer')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- === MPI expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_mpi_view') INTO v_has_perm;
    IF v_has_perm THEN
      IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 2 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_mpi_view_all')
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_mpi_view_own')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- === ANALYTICS expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_analytics_view') INTO v_has_perm;
    IF v_has_perm AND r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 2 THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_analytics_export')
      ON CONFLICT DO NOTHING;
    END IF;

    -- === DASHBOARD expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_dashboard_view') INTO v_has_perm;
    IF v_has_perm AND r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 2 THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_dashboard_export')
      ON CONFLICT DO NOTHING;
    END IF;

    -- === USERS expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_users_manage') INTO v_has_perm;
    IF v_has_perm THEN
      IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 1 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_users_role_assign'),
          (v_role_id, 'terminal_users_manage_all'),
          (v_role_id, 'terminal_users_bypass_code'),
          (v_role_id, 'terminal_users_manage_subordinates')
        ON CONFLICT DO NOTHING;
      ELSIF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 2 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_users_role_assign'),
          (v_role_id, 'terminal_users_manage_all'),
          (v_role_id, 'terminal_users_manage_subordinates')
        ON CONFLICT DO NOTHING;
      ELSIF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 3 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_users_manage_subordinates')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- === SHIFT expansion ===
    -- All roles with orders or settings get shift_view
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_orders_view') INTO v_has_perm;
    IF v_has_perm AND r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 5 THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_shift_view')
      ON CONFLICT DO NOTHING;
      IF r.hierarchy_level <= 4 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_shift_manage')
        ON CONFLICT DO NOTHING;
      END IF;
      IF r.hierarchy_level <= 2 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_shift_reconciliation')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- === AUDIT/LOGS expansion ===
    SELECT EXISTS(SELECT 1 FROM p2p_terminal_role_permissions WHERE role_id = v_role_id AND permission = 'terminal_audit_logs_view') INTO v_has_perm;
    IF v_has_perm THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_pricing_logs_view')
      ON CONFLICT DO NOTHING;
      IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 3 THEN
        INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
          (v_role_id, 'terminal_activity_logs_view')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- === DESTRUCTIVE — Admin only ===
    IF r.hierarchy_level IS NOT NULL AND r.hierarchy_level <= 0 THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_destructive')
      ON CONFLICT DO NOTHING;
    END IF;

    -- === ASSETS — Add to Admin (BUG-03 fix) ===
    IF r.name = 'Admin' THEN
      INSERT INTO p2p_terminal_role_permissions (role_id, permission) VALUES
        (v_role_id, 'terminal_assets_manage')
      ON CONFLICT DO NOTHING;
    END IF;

  END LOOP;

  -- === BUG-02 fix: Remove terminal_settings_manage from Operator and Payer roles ===
  DELETE FROM p2p_terminal_role_permissions
  WHERE permission = 'terminal_settings_manage'
    AND role_id IN (
      SELECT id FROM p2p_terminal_roles WHERE name IN ('Operator', 'Payer')
    );

  -- === Remove terminal_settings_manage from PAYER/OPERATOR too ===
  DELETE FROM p2p_terminal_role_permissions
  WHERE permission = 'terminal_settings_manage'
    AND role_id IN (
      SELECT id FROM p2p_terminal_roles WHERE name = 'PAYER/OPERATOR'
    );

  -- === Tier differentiation: Remove extra perms from lower tiers ===
  -- Team Lead (4): Remove ads_manage, autoreply_manage, broadcasts_create, activity_logs_view
  -- (These were granted by automation_manage expansion but should be removed for level 4)
  -- Actually Team Lead already had automation_manage so they got these. Let's selectively remove:
  -- Team Lead should NOT have: autoreply_manage, broadcasts_create, ads_rest_timer, autopay_toggle
  DELETE FROM p2p_terminal_role_permissions
  WHERE role_id = (SELECT id FROM p2p_terminal_roles WHERE name = 'Team Lead')
    AND permission::text IN ('terminal_autoreply_manage', 'terminal_broadcasts_create', 'terminal_ads_rest_timer');

  -- Asst Manager should NOT have: autopay_configure, broadcasts_manage
  DELETE FROM p2p_terminal_role_permissions
  WHERE role_id = (SELECT id FROM p2p_terminal_roles WHERE name = 'Assistant Manager')
    AND permission::text IN ('terminal_autopay_configure', 'terminal_broadcasts_manage');

END $$;
