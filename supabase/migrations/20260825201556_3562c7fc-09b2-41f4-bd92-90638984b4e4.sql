-- 1) Backfill specific finance permissions for every role holding the umbrella keys
INSERT INTO public.role_permissions (role_id, permission)
SELECT rp.role_id, x.perm::app_permission
FROM public.role_permissions rp
CROSS JOIN (VALUES ('tax_management_view'),('profit_loss_view'),('financials_view')) AS x(perm)
WHERE rp.permission = 'accounting_view'::app_permission
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission)
SELECT rp.role_id, x.perm::app_permission
FROM public.role_permissions rp
CROSS JOIN (VALUES ('tax_management_view'),('tax_management_manage'),('profit_loss_view'),('financials_view'),('financials_manage')) AS x(perm)
WHERE rp.permission = 'accounting_manage'::app_permission
ON CONFLICT DO NOTHING;

-- 2) Repoint ancient alias keys at the specific finance keys
INSERT INTO public.permission_implications (parent_permission, child_permission) VALUES
  ('view_accounting','tax_management_view'),
  ('view_accounting','profit_loss_view'),
  ('view_accounting','financials_view'),
  ('manage_accounting','tax_management_manage'),
  ('manage_accounting','financials_manage'),
  ('MANAGE_ACCOUNTING','tax_management_manage'),
  ('MANAGE_ACCOUNTING','financials_manage')
ON CONFLICT DO NOTHING;

-- 3) Drop all umbrella implications
DELETE FROM public.permission_implications
WHERE parent_permission IN ('accounting_view','accounting_manage')
   OR child_permission IN ('accounting_view','accounting_manage');

-- 4) Remove umbrella keys from all roles
DELETE FROM public.role_permissions
WHERE permission IN ('accounting_view'::app_permission,'accounting_manage'::app_permission);

-- 5) Rewrite helper functions to use the specific finance keys
CREATE OR REPLACE FUNCTION public.can_access_tax_records(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'tax_management_view'::app_permission)
    OR public.has_permission(_user_id, 'tax_management_manage'::app_permission)
    OR public.has_permission(_user_id, 'compliance_view'::app_permission)
    OR public.has_permission(_user_id, 'compliance_manage'::app_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_banking(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'bams_view'::app_permission)
    OR public.has_permission(_user_id, 'bams_manage'::app_permission)
    OR public.has_permission(_user_id, 'view_banking'::app_permission)
    OR public.has_permission(_user_id, 'manage_banking'::app_permission)
    OR public.has_permission(_user_id, 'financials_view'::app_permission)
    OR public.has_permission(_user_id, 'financials_manage'::app_permission)
    OR public.has_permission(_user_id, 'reconciliation_view'::app_permission)
    OR public.has_permission(_user_id, 'compliance_view'::app_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_banking(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'bams_manage'::app_permission)
    OR public.has_permission(_user_id, 'bams_journal_entry'::app_permission)
    OR public.has_permission(_user_id, 'manage_banking'::app_permission)
    OR public.has_permission(_user_id, 'financials_manage'::app_permission)
    OR public.has_permission(_user_id, 'erp_entry_manage'::app_permission)
    OR public.has_permission(_user_id, 'sales_manage'::app_permission)
    OR public.has_permission(_user_id, 'purchase_manage'::app_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_orders(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'sales_view'::app_permission)
    OR public.has_permission(_user_id, 'sales_manage'::app_permission)
    OR public.has_permission(_user_id, 'purchase_view'::app_permission)
    OR public.has_permission(_user_id, 'purchase_manage'::app_permission)
    OR public.has_permission(_user_id, 'view_sales'::app_permission)
    OR public.has_permission(_user_id, 'manage_sales'::app_permission)
    OR public.has_permission(_user_id, 'view_purchase'::app_permission)
    OR public.has_permission(_user_id, 'manage_purchase'::app_permission)
    OR public.has_permission(_user_id, 'erp_entry_view'::app_permission)
    OR public.has_permission(_user_id, 'erp_entry_manage'::app_permission)
    OR public.has_permission(_user_id, 'financials_view'::app_permission)
    OR public.has_permission(_user_id, 'profit_loss_view'::app_permission)
    OR public.has_permission(_user_id, 'statistics_view'::app_permission)
    OR public.has_permission(_user_id, 'reconciliation_view'::app_permission)
    OR public.has_permission(_user_id, 'stock_view'::app_permission)
    OR public.has_permission(_user_id, 'clients_view'::app_permission)
    OR public.has_permission(_user_id, 'compliance_view'::app_permission)
    OR public.has_permission(_user_id, 'terminal_view'::app_permission)
    OR public.has_permission(_user_id, 'tax_management_view'::app_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.storage_can_read_sensitive_bucket(_bucket text, _uid uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    _uid IS NOT NULL
    AND (
      public.has_permission(_uid, 'super_admin_access')
      OR public.has_permission(_uid, 'admin_access')
      OR (_owner IS NOT NULL AND _owner = _uid)
      OR CASE _bucket
        WHEN 'kyc-documents' THEN
          public.has_permission(_uid, 'clients_view')
          OR public.has_permission(_uid, 'kyc_approvals_view')
          OR public.has_permission(_uid, 'compliance_view')
          OR public.has_permission(_uid, 'video_kyc_view')
        WHEN 'employee-documents' THEN
          public.hr_is_hr_staff(_uid)
          OR public.has_permission(_uid, 'hrms_view')
          OR public.has_permission(_uid, 'payroll_view')
        WHEN 'investigation-documents' THEN
          public.has_permission(_uid, 'compliance_view')
          OR public.has_permission(_uid, 'compliance_manage')
        WHEN 'documents' THEN
          public.has_permission(_uid, 'tax_management_view')
          OR public.has_permission(_uid, 'financials_view')
          OR public.has_permission(_uid, 'bams_view')
          OR public.has_permission(_uid, 'erp_entry_view')
        WHEN 'sales_attachments' THEN
          public.has_permission(_uid, 'sales_view')
          OR public.has_permission(_uid, 'purchase_view')
          OR public.has_permission(_uid, 'financials_view')
          OR public.has_permission(_uid, 'erp_entry_view')
        WHEN 'transaction-bills' THEN
          public.has_permission(_uid, 'financials_view')
          OR public.has_permission(_uid, 'tax_management_view')
          OR public.has_permission(_uid, 'bams_view')
          OR public.has_permission(_uid, 'erp_entry_view')
        WHEN 'internal-chat-files' THEN
          public.has_permission(_uid, 'tasks_view')
          OR public.has_permission(_uid, 'ems_view')
          OR public.has_permission(_uid, 'dashboard_view')
        WHEN 'task-attachments' THEN
          public.has_permission(_uid, 'tasks_view')
          OR public.has_permission(_uid, 'ems_view')
        ELSE false
      END
    );
$function$;

CREATE OR REPLACE FUNCTION public.storage_can_write_sensitive_bucket(_bucket text, _uid uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    _uid IS NOT NULL
    AND (
      public.has_permission(_uid, 'super_admin_access')
      OR public.has_permission(_uid, 'admin_access')
      OR (_owner IS NOT NULL AND _owner = _uid)
      OR CASE _bucket
        WHEN 'kyc-documents' THEN
          public.has_permission(_uid, 'clients_manage')
          OR public.has_permission(_uid, 'kyc_approvals_manage')
          OR public.has_permission(_uid, 'compliance_manage')
          OR public.has_permission(_uid, 'video_kyc_manage')
        WHEN 'employee-documents' THEN
          public.hr_is_hr_staff(_uid)
          OR public.has_permission(_uid, 'hrms_manage')
        WHEN 'investigation-documents' THEN
          public.has_permission(_uid, 'compliance_manage')
        WHEN 'documents' THEN
          public.has_permission(_uid, 'tax_management_manage')
          OR public.has_permission(_uid, 'financials_manage')
          OR public.has_permission(_uid, 'bams_manage')
          OR public.has_permission(_uid, 'erp_entry_manage')
        WHEN 'sales_attachments' THEN
          public.has_permission(_uid, 'sales_manage')
          OR public.has_permission(_uid, 'purchase_manage')
          OR public.has_permission(_uid, 'financials_manage')
          OR public.has_permission(_uid, 'erp_entry_manage')
        WHEN 'transaction-bills' THEN
          public.has_permission(_uid, 'financials_manage')
          OR public.has_permission(_uid, 'tax_management_manage')
          OR public.has_permission(_uid, 'bams_manage')
          OR public.has_permission(_uid, 'erp_entry_manage')
        WHEN 'internal-chat-files' THEN
          public.has_permission(_uid, 'tasks_manage')
          OR public.has_permission(_uid, 'ems_manage')
          OR public.has_permission(_uid, 'tasks_view')
        WHEN 'task-attachments' THEN
          public.has_permission(_uid, 'tasks_manage')
          OR public.has_permission(_uid, 'tasks_view')
        ELSE false
      END
    );
$function$;

REVOKE ALL ON FUNCTION public.can_access_tax_records(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_banking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_banking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_orders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_tax_records(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_banking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_banking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_orders(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;