-- Safety: anyone holding an EMS key keeps equivalent practical access via Tasks
INSERT INTO public.role_permissions (role_id, permission)
SELECT rp.role_id, 'tasks_view'::app_permission
FROM public.role_permissions rp
WHERE rp.permission IN ('ems_view'::app_permission, 'ems_manage'::app_permission)
ON CONFLICT DO NOTHING;

DELETE FROM public.permission_implications
WHERE parent_permission IN ('ems_view','ems_manage')
   OR child_permission IN ('ems_view','ems_manage');

DELETE FROM public.role_permissions
WHERE permission IN ('ems_view'::app_permission, 'ems_manage'::app_permission);

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
          OR public.has_permission(_uid, 'dashboard_view')
        WHEN 'task-attachments' THEN
          public.has_permission(_uid, 'tasks_view')
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
          OR public.has_permission(_uid, 'tasks_view')
        WHEN 'task-attachments' THEN
          public.has_permission(_uid, 'tasks_manage')
          OR public.has_permission(_uid, 'tasks_view')
        ELSE false
      END
    );
$function$;

REVOKE ALL ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;