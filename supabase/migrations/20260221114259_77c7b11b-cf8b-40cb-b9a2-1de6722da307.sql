
-- Step 1: Insert new departments
INSERT INTO departments (name, code, hierarchy_level, is_active)
VALUES
  ('Management', 'MGMT', 1, true),
  ('Marketing / Relationship', 'MKT', 2, true),
  ('Accounts / Taxation and Banking', 'ACCT', 2, true);

-- Step 2: Update hierarchy levels for existing departments
UPDATE departments SET hierarchy_level = 2 WHERE code = 'OPS';
UPDATE departments SET hierarchy_level = 2 WHERE code = 'FIN';
UPDATE departments SET hierarchy_level = 2 WHERE code = 'COMP';
UPDATE departments SET hierarchy_level = 3 WHERE code = 'ADMIN';
UPDATE departments SET hierarchy_level = 4 WHERE code = 'SUPPORT';

-- Step 3: Delete existing misplaced positions (MD and Deputy MD under Administrative)
DELETE FROM positions WHERE id IN ('66574729-83e3-4291-8486-b9e2936a02f1', '0e9cc468-1b37-4def-850c-f9b3f13d4f26');

-- Step 4: Insert all positions with correct department mappings
-- We use a DO block to handle the reports_to_position_id references

DO $$
DECLARE
  dept_mgmt UUID;
  dept_ops UUID;
  dept_comp UUID;
  dept_mkt UUID;
  dept_fin UUID;
  dept_acct UUID;
  -- Position IDs
  pos_md UUID;
  pos_dmd UUID;
  pos_gm UUID;
  pos_cco UUID;
  pos_hic UUID;
  pos_hec UUID;
  pos_ico UUID;
  pos_fco UUID;
  pos_kyc UUID;
  pos_cfe UUID;
  pos_om UUID;
  pos_am UUID;
  pos_tl UUID;
  pos_se UUID;
  pos_pe UUID;
  pos_rmh UUID;
  pos_rm UUID;
  pos_cfo UUID;
  pos_fho UUID;
  pos_fm UUID;
  pos_pp UUID;
  pos_fhtb UUID;
  pos_acc UUID;
  pos_bo UUID;
  pos_ode UUID;
BEGIN
  -- Get department IDs
  SELECT id INTO dept_mgmt FROM departments WHERE code = 'MGMT';
  SELECT id INTO dept_ops FROM departments WHERE code = 'OPS';
  SELECT id INTO dept_comp FROM departments WHERE code = 'COMP';
  SELECT id INTO dept_mkt FROM departments WHERE code = 'MKT';
  SELECT id INTO dept_fin FROM departments WHERE code = 'FIN';
  SELECT id INTO dept_acct FROM departments WHERE code = 'ACCT';

  -- Management positions
  pos_md := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_md, 'Managing Director', dept_mgmt, 10, true, NULL);

  pos_dmd := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_dmd, 'Deputy Managing Director', dept_mgmt, 9, true, pos_md);

  pos_gm := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_gm, 'General Manager', dept_mgmt, 8, true, pos_dmd);

  -- Compliance positions
  pos_cco := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_cco, 'Chief Compliance Officer', dept_comp, 8, true, pos_gm);

  pos_hic := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_hic, 'Head Internal Compliance', dept_comp, 7, true, pos_cco);

  pos_hec := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_hec, 'Head External Compliance', dept_comp, 7, true, pos_cco);

  pos_ico := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_ico, 'Internal Compliance Officer', dept_comp, 6, true, pos_hic);

  pos_fco := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_fco, 'Field Compliance Officer', dept_comp, 6, true, pos_hec);

  pos_kyc := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_kyc, 'KYC Executive', dept_comp, 5, true, pos_ico);

  pos_cfe := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_cfe, 'Compliance Filing Executive', dept_comp, 5, true, pos_hec);

  -- Operations positions
  pos_om := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_om, 'Operations Manager', dept_ops, 8, true, pos_gm);

  pos_am := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_am, 'Assistant Manager', dept_ops, 7, true, pos_om);

  pos_tl := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_tl, 'Team Lead', dept_ops, 6, true, pos_am);

  pos_se := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_se, 'Sales Executive', dept_ops, 5, true, pos_tl);

  pos_pe := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_pe, 'Purchase Executive', dept_ops, 5, true, pos_tl);

  -- Marketing / Relationship positions
  pos_rmh := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_rmh, 'Relationship / Marketing Head', dept_mkt, 8, true, pos_gm);

  pos_rm := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_rm, 'Relationship Manager', dept_mkt, 6, true, pos_rmh);

  -- Finance positions
  pos_cfo := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_cfo, 'Chief Financial Officer', dept_fin, 9, true, pos_gm);

  pos_fho := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_fho, 'Finance Head - Operations', dept_fin, 8, true, pos_cfo);

  pos_fm := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_fm, 'Finance Manager', dept_fin, 7, true, pos_fho);

  pos_pp := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_pp, 'Payment Processor', dept_fin, 5, true, pos_fm);

  -- Accounts / Taxation and Banking positions
  pos_fhtb := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_fhtb, 'Finance Head - Taxation And Banking', dept_acct, 8, true, pos_cfo);

  pos_acc := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_acc, 'Accountant', dept_acct, 6, true, pos_fhtb);

  pos_bo := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_bo, 'Banking Officer', dept_acct, 6, true, pos_fhtb);

  pos_ode := gen_random_uuid();
  INSERT INTO positions (id, title, department_id, hierarchy_level, is_active, reports_to_position_id)
  VALUES (pos_ode, 'Operator / Data Entry', dept_acct, 5, true, pos_acc);
END $$;
