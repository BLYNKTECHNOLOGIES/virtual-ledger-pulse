
-- Remove existing Admin role from Shubham Singh and assign Super Admin
DELETE FROM user_roles WHERE user_id = 'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9';

INSERT INTO user_roles (user_id, role_id)
VALUES ('d1a85fd5-f5a8-47af-ae42-e0b4683d82c9', 'cd655fe8-abdd-43b8-932f-01284e64de73');

-- Also update the role_id on users table for consistency
UPDATE users SET role_id = 'cd655fe8-abdd-43b8-932f-01284e64de73' WHERE id = 'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9';

-- Add all admin permissions to Super Admin role so it has full access
INSERT INTO role_permissions (role_id, permission)
SELECT 'cd655fe8-abdd-43b8-932f-01284e64de73', unnest(ARRAY[
  'dashboard_view', 'sales_view', 'sales_manage', 'purchase_view', 'purchase_manage',
  'bams_view', 'bams_manage', 'clients_view', 'clients_manage', 'leads_view', 'leads_manage',
  'user_management_view', 'user_management_manage', 'hrms_view', 'hrms_manage',
  'payroll_view', 'payroll_manage', 'compliance_view', 'compliance_manage',
  'stock_view', 'stock_manage', 'accounting_view', 'accounting_manage',
  'video_kyc_view', 'video_kyc_manage', 'kyc_approvals_view', 'kyc_approvals_manage',
  'statistics_view', 'statistics_manage', 'admin_access'
]::app_permission[])
ON CONFLICT DO NOTHING;
