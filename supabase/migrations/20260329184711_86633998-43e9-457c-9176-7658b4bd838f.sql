-- Phase 1: Permission Data Fixes & Enum Cleanup

-- 1. Set Super Admin as system role
UPDATE public.roles SET is_system_role = true WHERE name = 'Super Admin';

-- 2. Strip Auditor's destructive and manage permissions (keep only _view + dashboard_view)
DELETE FROM public.role_permissions 
WHERE role_id = (SELECT id FROM public.roles WHERE name = 'Auditor')
AND permission::text NOT LIKE '%_view';

-- 3. Add missing permissions to Super Admin (tasks and utility)
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.perm::app_permission
FROM public.roles r
CROSS JOIN (VALUES ('tasks_view'), ('tasks_manage'), ('utility_view'), ('utility_manage')) AS p(perm)
WHERE r.name IN ('Super Admin', 'Admin')
ON CONFLICT (role_id, permission) DO NOTHING;

-- 4. Delete the legacy 'payer' role (it was only for purchase_creator/payer split)
-- First delete its role_permissions
DELETE FROM public.role_permissions WHERE role_id = (SELECT id FROM public.roles WHERE name = 'payer');
-- Delete from user_roles
DELETE FROM public.user_roles WHERE role_id = (SELECT id FROM public.roles WHERE name = 'payer');
-- Delete the role itself
DELETE FROM public.roles WHERE name = 'payer';

-- 5. Remove dead enum values from app_permission
-- We need to recreate the enum with only the values actually in use
-- The used values (from role_permissions + hardcoded in usePermissions):
-- dashboard_view, sales_view, sales_manage, purchase_view, purchase_manage,
-- terminal_view, terminal_manage, bams_view, bams_manage, clients_view, clients_manage,
-- leads_view, leads_manage, user_management_view, user_management_manage,
-- hrms_view, hrms_manage, payroll_view, payroll_manage, compliance_view, compliance_manage,
-- stock_view, stock_manage, accounting_view, accounting_manage,
-- video_kyc_view, video_kyc_manage, kyc_approvals_view, kyc_approvals_manage,
-- statistics_view, statistics_manage, erp_destructive, terminal_destructive,
-- bams_destructive, clients_destructive, stock_destructive,
-- utility_view, utility_manage, tasks_view, tasks_manage,
-- shift_reconciliation_approve, ems_view, ems_manage,
-- admin_access, super_admin_access,
-- stock_conversion_create, stock_conversion_approve

-- Note: Enum values cannot be removed in PostgreSQL without recreating the type.
-- This is a complex operation that requires recreating all dependent columns.
-- We'll skip the actual enum cleanup for safety and instead document the dead values.
-- The dead values don't cause functional issues - they just show in the type definition.

-- 6. Create a comment documenting the active permissions for reference
COMMENT ON TYPE public.app_permission IS 'Active permissions: dashboard_view, sales_view/manage, purchase_view/manage, terminal_view/manage, bams_view/manage, clients_view/manage, leads_view/manage, user_management_view/manage, hrms_view/manage, payroll_view/manage, compliance_view/manage, stock_view/manage, accounting_view/manage, video_kyc_view/manage, kyc_approvals_view/manage, statistics_view/manage, erp_destructive, terminal_destructive, bams_destructive, clients_destructive, stock_destructive, utility_view/manage, tasks_view/manage, shift_reconciliation_approve, ems_view/manage, admin_access, super_admin_access, stock_conversion_create/approve. Legacy values (unused): CREATE_USERS, DELETE_USERS, READ_USERS, UPDATE_USERS, VIEW_REPORTS, MANAGE_*, manage_*, view_*';