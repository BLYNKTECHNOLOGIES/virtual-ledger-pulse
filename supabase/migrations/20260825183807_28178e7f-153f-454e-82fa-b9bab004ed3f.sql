CREATE TABLE IF NOT EXISTS public.permission_implications (
  parent_permission text NOT NULL,
  child_permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_permission, child_permission)
);

GRANT SELECT ON public.permission_implications TO authenticated;
GRANT ALL ON public.permission_implications TO service_role;
ALTER TABLE public.permission_implications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read permission implications"
  ON public.permission_implications FOR SELECT TO authenticated USING (true);

DELETE FROM public.permission_implications;
INSERT INTO public.permission_implications (parent_permission, child_permission) VALUES
  ('accounting_view','tax_management_view'),
  ('accounting_view','profit_loss_view'),
  ('accounting_view','financials_view'),
  ('accounting_manage','accounting_view'),
  ('accounting_manage','tax_management_manage'),
  ('accounting_manage','financials_manage'),
  ('bams_manage','bams_view'),
  ('bams_manage','bams_journal_entry'),
  ('clients_view','kyc_approvals_view'),
  ('clients_view','video_kyc_view'),
  ('clients_manage','clients_view'),
  ('clients_manage','kyc_approvals_manage'),
  ('clients_manage','video_kyc_manage'),
  ('kyc_approvals_manage','kyc_approvals_view'),
  ('video_kyc_manage','video_kyc_view'),
  ('hrms_view','payroll_view'),
  ('hrms_manage','hrms_view'),
  ('hrms_manage','hrms_razorpay_sync'),
  ('hrms_manage','payroll_manage'),
  ('payroll_manage','payroll_view'),
  ('hrms_employees_view','hrms_view'),
  ('hrms_attendance_view','hrms_view'),
  ('hrms_leave_view','hrms_view'),
  ('hrms_payroll_view','hrms_view'),
  ('hrms_recruitment_view','hrms_view'),
  ('hrms_documents_view','hrms_view'),
  ('hrms_assets_view','hrms_view'),
  ('hrms_pms_view','hrms_view'),
  ('hrms_mailbox_view','hrms_view'),
  ('hrms_data_health_view','hrms_view'),
  ('hrms_employees_manage','hrms_manage'),
  ('hrms_attendance_manage','hrms_manage'),
  ('hrms_attendance_approve','hrms_manage'),
  ('hrms_leave_manage','hrms_manage'),
  ('hrms_leave_approve','hrms_manage'),
  ('hrms_payroll_manage','hrms_manage'),
  ('hrms_recruitment_manage','hrms_manage'),
  ('hrms_documents_manage','hrms_manage'),
  ('hrms_assets_manage','hrms_manage'),
  ('hrms_pms_manage','hrms_manage'),
  ('hrms_mailbox_manage','hrms_manage'),
  ('sales_manage','sales_view'),
  ('purchase_manage','purchase_view'),
  ('stock_manage','stock_view'),
  ('leads_manage','leads_view'),
  ('compliance_manage','compliance_view'),
  ('compliance_approve','compliance_view'),
  ('risk_management_manage','risk_management_view'),
  ('tax_management_manage','tax_management_view'),
  ('financials_manage','financials_view'),
  ('statistics_manage','statistics_view'),
  ('support_manage','support_view'),
  ('tasks_manage','tasks_view'),
  ('utility_manage','utility_view'),
  ('user_management_manage','user_management_view'),
  ('erp_entry_manage','erp_entry_view'),
  ('terminal_manage','terminal_view'),
  ('stock_conversion_approve','stock_view'),
  ('shift_reconciliation_create','reconciliation_view'),
  ('shift_reconciliation_approve','reconciliation_view'),
  ('help_assistant_manage','help_assistant_view'),
  ('ems_manage','ems_view'),
  ('view_dashboard','dashboard_view'),
  ('view_sales','sales_view'),
  ('view_purchase','purchase_view'),
  ('view_bams','bams_view'),
  ('view_banking','bams_view'),
  ('view_clients','clients_view'),
  ('view_leads','leads_view'),
  ('view_user_management','user_management_view'),
  ('view_hrms','hrms_view'),
  ('view_payroll','payroll_view'),
  ('view_compliance','compliance_view'),
  ('view_stock','stock_view'),
  ('view_stock_management','stock_view'),
  ('view_inventory','stock_view'),
  ('view_accounting','accounting_view'),
  ('VIEW_REPORTS','statistics_view'),
  ('manage_sales','sales_manage'),
  ('MANAGE_SALES','sales_manage'),
  ('manage_purchase','purchase_manage'),
  ('MANAGE_PURCHASE','purchase_manage'),
  ('manage_stock','stock_manage'),
  ('MANAGE_STOCK','stock_manage'),
  ('manage_inventory','stock_manage'),
  ('manage_clients','clients_manage'),
  ('MANAGE_CLIENTS','clients_manage'),
  ('manage_leads','leads_manage'),
  ('MANAGE_LEADS','leads_manage'),
  ('manage_hrms','hrms_manage'),
  ('MANAGE_HRMS','hrms_manage'),
  ('manage_payroll','payroll_manage'),
  ('MANAGE_PAYROLL','payroll_manage'),
  ('manage_accounting','accounting_manage'),
  ('MANAGE_ACCOUNTING','accounting_manage'),
  ('manage_banking','bams_manage'),
  ('manage_compliance','compliance_manage'),
  ('MANAGE_COMPLIANCE','compliance_manage'),
  ('manage_users','user_management_manage'),
  ('CREATE_USERS','user_management_manage'),
  ('READ_USERS','user_management_view'),
  ('UPDATE_USERS','user_management_manage'),
  ('DELETE_USERS','user_management_manage'),
  ('manage_roles','user_management_manage'),
  ('MANAGE_ROLES','user_management_manage'),
  ('MANAGE_SYSTEM','user_management_manage');

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission app_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE held AS (
    SELECT rp.permission::text AS perm
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id
  ), effective AS (
    SELECT perm FROM held
    UNION
    SELECT pi.child_permission
    FROM effective e
    JOIN public.permission_implications pi ON pi.parent_permission = e.perm
  )
  SELECT EXISTS (
    SELECT 1 FROM held WHERE perm IN ('super_admin_access','admin_access')
  ) OR EXISTS (
    SELECT 1 FROM effective WHERE perm = _permission::text
  )
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(user_uuid uuid, check_permission app_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission(user_uuid, check_permission)
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, app_permission) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_permission(uuid, app_permission) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, app_permission) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, app_permission) TO authenticated, service_role;