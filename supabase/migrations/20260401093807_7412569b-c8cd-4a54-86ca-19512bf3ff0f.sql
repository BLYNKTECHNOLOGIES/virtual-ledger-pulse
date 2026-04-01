
-- Grant terminal_view and terminal_manage to all ERP roles that have users in the terminal system
-- but are currently missing these base ERP permissions
INSERT INTO role_permissions (role_id, permission)
SELECT r.role_id, p.perm
FROM (
  VALUES 
    ('cd655fe8-abdd-43b8-932f-01284e64de73'::uuid),  -- Super Admin
    ('55732c35-1310-4fc8-b810-f715afe3c0f4'::uuid),  -- Admin
    ('4cfc79ef-e577-4564-b679-d7b5f30dbe27'::uuid),  -- operation
    ('2bb2c7ed-13dd-4f8e-a02d-754512c9c5ba'::uuid),  -- Finance
    ('eeace31d-c038-412d-a5f0-5a2780338185'::uuid)   -- Auditor
) AS r(role_id)
CROSS JOIN (
  VALUES ('terminal_view'::app_permission), ('terminal_manage'::app_permission)
) AS p(perm)
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp 
  WHERE rp.role_id = r.role_id AND rp.permission = p.perm
);
