
DO $$
DECLARE
  v_ceo_id UUID := gen_random_uuid();
  v_gm_id UUID := '3dd47268-304c-4551-b5fc-c86927e0951e';
  v_ops_mgr_id UUID := '2408c464-5c39-4f07-ad34-57a103185f77';
  v_mgmt_dept_id UUID := '5342e1dd-870d-4f71-bb34-0f31807a7b31';
BEGIN
  -- Insert CEO position under GM in Management department
  INSERT INTO positions (id, title, department_id, hierarchy_level, reports_to_position_id, is_active)
  VALUES (v_ceo_id, 'Chief Executive Officer', v_mgmt_dept_id, 9, v_gm_id, true);

  -- Update Operations Manager to report to CEO instead of GM
  UPDATE positions SET reports_to_position_id = v_ceo_id WHERE id = v_ops_mgr_id;
END $$;
