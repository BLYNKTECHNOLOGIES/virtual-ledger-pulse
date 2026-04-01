-- Grant stock_conversion_approve and stock_conversion_create to key roles
INSERT INTO role_permissions (role_id, permission)
VALUES
  -- Super Admin
  ('cd655fe8-abdd-43b8-932f-01284e64de73', 'stock_conversion_approve'),
  ('cd655fe8-abdd-43b8-932f-01284e64de73', 'stock_conversion_create'),
  -- Admin
  ('55732c35-1310-4fc8-b810-f715afe3c0f4', 'stock_conversion_approve'),
  ('55732c35-1310-4fc8-b810-f715afe3c0f4', 'stock_conversion_create'),
  -- COO
  ('bcdf7ebb-c22c-49ee-8505-3eb7c0b32a3a', 'stock_conversion_approve'),
  ('bcdf7ebb-c22c-49ee-8505-3eb7c0b32a3a', 'stock_conversion_create'),
  -- operation
  ('4cfc79ef-e577-4564-b679-d7b5f30dbe27', 'stock_conversion_approve'),
  ('4cfc79ef-e577-4564-b679-d7b5f30dbe27', 'stock_conversion_create')
ON CONFLICT (role_id, permission) DO NOTHING;