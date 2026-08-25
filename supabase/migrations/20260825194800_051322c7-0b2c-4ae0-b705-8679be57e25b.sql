-- 1. Tighten hr_is_hr_staff: explicit role names + real HRMS permission grants (no LIKE matching)
CREATE OR REPLACE FUNCTION public.hr_is_hr_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = _user_id
        AND lower(replace(r.name,'_',' ')) IN ('super admin','admin','hr','hr manager','hr admin')
    )
    OR public.has_permission(_user_id, 'hrms_manage'::app_permission)
    OR public.has_permission(_user_id, 'hrms_view'::app_permission)
    OR public.has_permission(_user_id, 'manage_hrms'::app_permission)
    OR public.has_permission(_user_id, 'view_hrms'::app_permission)
  )
$function$;

-- 2. Narrow full-user-record reads (drop name-pattern HR path)
CREATE OR REPLACE FUNCTION public.users_can_read_full(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'user_management_view'::app_permission)
    OR public.has_permission(_user_id, 'user_management_manage'::app_permission)
    OR public.has_permission(_user_id, 'user_management_hr_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_users'::app_permission)
    OR public.has_permission(_user_id, 'READ_USERS'::app_permission)
    OR public.has_permission(_user_id, 'hrms_manage'::app_permission)
  )
$function$;

-- 3. Access helpers
CREATE OR REPLACE FUNCTION public.can_view_banking(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'bams_view'::app_permission)
    OR public.has_permission(_user_id, 'bams_manage'::app_permission)
    OR public.has_permission(_user_id, 'view_banking'::app_permission)
    OR public.has_permission(_user_id, 'manage_banking'::app_permission)
    OR public.has_permission(_user_id, 'accounting_view'::app_permission)
    OR public.has_permission(_user_id, 'accounting_manage'::app_permission)
    OR public.has_permission(_user_id, 'financials_view'::app_permission)
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
    OR public.has_permission(_user_id, 'accounting_manage'::app_permission)
    OR public.has_permission(_user_id, 'erp_entry_manage'::app_permission)
    OR public.has_permission(_user_id, 'sales_manage'::app_permission)
    OR public.has_permission(_user_id, 'purchase_manage'::app_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_clients(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'clients_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_clients'::app_permission)
    OR public.has_permission(_user_id, 'kyc_approvals_manage'::app_permission)
    OR public.has_permission(_user_id, 'video_kyc_manage'::app_permission)
    OR public.has_permission(_user_id, 'compliance_manage'::app_permission)
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
    OR public.has_permission(_user_id, 'accounting_view'::app_permission)
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

CREATE OR REPLACE FUNCTION public.can_manage_orders(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'sales_manage'::app_permission)
    OR public.has_permission(_user_id, 'purchase_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_sales'::app_permission)
    OR public.has_permission(_user_id, 'manage_purchase'::app_permission)
    OR public.has_permission(_user_id, 'erp_entry_manage'::app_permission)
    OR public.has_permission(_user_id, 'terminal_manage'::app_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.hr_can_access_payroll_data(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.hr_is_hr_staff(_user_id)
    OR public.hr_payroll_cockpit_authorized(_user_id)
    OR public.has_permission(_user_id, 'payroll_view'::app_permission)
    OR public.has_permission(_user_id, 'payroll_manage'::app_permission)
    OR public.has_permission(_user_id, 'hrms_payroll_view'::app_permission)
    OR public.has_permission(_user_id, 'hrms_payroll_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_payroll'::app_permission)
    OR public.has_permission(_user_id, 'view_payroll'::app_permission)
  )
$function$;

-- 4. clients
DROP POLICY IF EXISTS authenticated_all_clients ON public.clients;
CREATE POLICY clients_select_scoped ON public.clients FOR SELECT TO authenticated
  USING (public.can_access_client_kyc(auth.uid()) OR public.can_view_orders(auth.uid()));
CREATE POLICY clients_insert_scoped ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY clients_update_scoped ON public.clients FOR UPDATE TO authenticated
  USING (public.can_manage_clients(auth.uid())) WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY clients_delete_scoped ON public.clients FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_permission(auth.uid(), 'clients_destructive'::app_permission));

-- 5. client_bank_details / client_income_details / client_verified_names / client_binance_nicknames
DROP POLICY IF EXISTS "Authenticated users can view bank details" ON public.client_bank_details;
DROP POLICY IF EXISTS "Authenticated users can insert bank details" ON public.client_bank_details;
DROP POLICY IF EXISTS "Authenticated users can update bank details" ON public.client_bank_details;
DROP POLICY IF EXISTS "Authenticated users can delete bank details" ON public.client_bank_details;
CREATE POLICY client_bank_details_select ON public.client_bank_details FOR SELECT TO authenticated
  USING (public.can_access_client_kyc(auth.uid()));
CREATE POLICY client_bank_details_write ON public.client_bank_details FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY client_bank_details_update ON public.client_bank_details FOR UPDATE TO authenticated
  USING (public.can_manage_clients(auth.uid())) WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY client_bank_details_delete ON public.client_bank_details FOR DELETE TO authenticated
  USING (public.can_manage_clients(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view income details" ON public.client_income_details;
DROP POLICY IF EXISTS "Authenticated users can insert income details" ON public.client_income_details;
DROP POLICY IF EXISTS "Authenticated users can update income details" ON public.client_income_details;
DROP POLICY IF EXISTS "Authenticated users can delete income details" ON public.client_income_details;
CREATE POLICY client_income_details_select ON public.client_income_details FOR SELECT TO authenticated
  USING (public.can_access_client_kyc(auth.uid()));
CREATE POLICY client_income_details_insert ON public.client_income_details FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY client_income_details_update ON public.client_income_details FOR UPDATE TO authenticated
  USING (public.can_manage_clients(auth.uid())) WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY client_income_details_delete ON public.client_income_details FOR DELETE TO authenticated
  USING (public.can_manage_clients(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view verified names" ON public.client_verified_names;
DROP POLICY IF EXISTS "Authenticated users can insert verified names" ON public.client_verified_names;
DROP POLICY IF EXISTS "Authenticated users can update verified names" ON public.client_verified_names;
CREATE POLICY client_verified_names_select ON public.client_verified_names FOR SELECT TO authenticated
  USING (public.can_access_client_kyc(auth.uid()) OR public.can_view_orders(auth.uid()));
CREATE POLICY client_verified_names_insert ON public.client_verified_names FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clients(auth.uid()));
CREATE POLICY client_verified_names_update ON public.client_verified_names FOR UPDATE TO authenticated
  USING (public.can_manage_clients(auth.uid())) WITH CHECK (public.can_manage_clients(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view nickname links" ON public.client_binance_nicknames;
DROP POLICY IF EXISTS "Authenticated users can insert nickname links" ON public.client_binance_nicknames;
DROP POLICY IF EXISTS "Authenticated users can update nickname links" ON public.client_binance_nicknames;
CREATE POLICY client_binance_nicknames_select ON public.client_binance_nicknames FOR SELECT TO authenticated
  USING (public.can_access_client_kyc(auth.uid()) OR public.can_view_orders(auth.uid()));
CREATE POLICY client_binance_nicknames_insert ON public.client_binance_nicknames FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clients(auth.uid()) OR public.can_manage_orders(auth.uid()));
CREATE POLICY client_binance_nicknames_update ON public.client_binance_nicknames FOR UPDATE TO authenticated
  USING (public.can_manage_clients(auth.uid()) OR public.can_manage_orders(auth.uid()))
  WITH CHECK (public.can_manage_clients(auth.uid()) OR public.can_manage_orders(auth.uid()));

-- 6. bank_transactions (ledger stays append-only via triggers)
DROP POLICY IF EXISTS authenticated_all_bank_transactions ON public.bank_transactions;
CREATE POLICY bank_transactions_select ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.can_view_banking(auth.uid()));
CREATE POLICY bank_transactions_insert ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_banking(auth.uid()));
CREATE POLICY bank_transactions_update ON public.bank_transactions FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY bank_transactions_delete ON public.bank_transactions FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()));

-- 7. sales / purchase orders + sales payment splits
DROP POLICY IF EXISTS authenticated_all_sales_orders ON public.sales_orders;
CREATE POLICY sales_orders_select ON public.sales_orders FOR SELECT TO authenticated
  USING (public.can_view_orders(auth.uid()));
CREATE POLICY sales_orders_insert ON public.sales_orders FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_orders(auth.uid()));
CREATE POLICY sales_orders_update ON public.sales_orders FOR UPDATE TO authenticated
  USING (public.can_manage_orders(auth.uid())) WITH CHECK (public.can_manage_orders(auth.uid()));
CREATE POLICY sales_orders_delete ON public.sales_orders FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_permission(auth.uid(), 'erp_destructive'::app_permission));

DROP POLICY IF EXISTS authenticated_all_purchase_orders ON public.purchase_orders;
CREATE POLICY purchase_orders_select ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.can_view_orders(auth.uid()));
CREATE POLICY purchase_orders_insert ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_orders(auth.uid()));
CREATE POLICY purchase_orders_update ON public.purchase_orders FOR UPDATE TO authenticated
  USING (public.can_manage_orders(auth.uid())) WITH CHECK (public.can_manage_orders(auth.uid()));
CREATE POLICY purchase_orders_delete ON public.purchase_orders FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_permission(auth.uid(), 'erp_destructive'::app_permission));

DROP POLICY IF EXISTS "Authenticated users can read sales payment splits" ON public.sales_order_payment_splits;
DROP POLICY IF EXISTS "Authenticated users can insert sales payment splits" ON public.sales_order_payment_splits;
DROP POLICY IF EXISTS "Authenticated users can delete sales payment splits" ON public.sales_order_payment_splits;
CREATE POLICY sales_order_payment_splits_select ON public.sales_order_payment_splits FOR SELECT TO authenticated
  USING (public.can_view_orders(auth.uid()));
CREATE POLICY sales_order_payment_splits_insert ON public.sales_order_payment_splits FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_orders(auth.uid()));
CREATE POLICY sales_order_payment_splits_delete ON public.sales_order_payment_splits FOR DELETE TO authenticated
  USING (public.can_manage_orders(auth.uid()));

-- 8. hr_attendance_daily: HR/payroll staff, or the employee themselves
DROP POLICY IF EXISTS authenticated_all_hr_attendance_daily ON public.hr_attendance_daily;
CREATE POLICY hr_attendance_daily_select ON public.hr_attendance_daily FOR SELECT TO authenticated
  USING (
    public.hr_is_hr_staff(auth.uid())
    OR public.hr_can_access_payroll_data(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.hr_employees e
      WHERE e.id = hr_attendance_daily.employee_id AND e.user_id = auth.uid()
    )
  );
CREATE POLICY hr_attendance_daily_write ON public.hr_attendance_daily FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()))
  WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- 9. payroll / salary structure tables
DROP POLICY IF EXISTS authenticated_all_hr_payroll_runs ON public.hr_payroll_runs;
CREATE POLICY hr_payroll_runs_scoped ON public.hr_payroll_runs FOR ALL TO authenticated
  USING (public.hr_can_access_payroll_data(auth.uid()))
  WITH CHECK (public.hr_can_access_payroll_data(auth.uid()));

DROP POLICY IF EXISTS authenticated_all_hr_salary_components ON public.hr_salary_components;
CREATE POLICY hr_salary_components_scoped ON public.hr_salary_components FOR ALL TO authenticated
  USING (public.hr_can_access_payroll_data(auth.uid()))
  WITH CHECK (public.hr_can_access_payroll_data(auth.uid()));

DROP POLICY IF EXISTS authenticated_all_hr_salary_structure_templates ON public.hr_salary_structure_templates;
CREATE POLICY hr_salary_structure_templates_scoped ON public.hr_salary_structure_templates FOR ALL TO authenticated
  USING (public.hr_can_access_payroll_data(auth.uid()))
  WITH CHECK (public.hr_can_access_payroll_data(auth.uid()));

DROP POLICY IF EXISTS authenticated_all_hr_salary_structure_template_items ON public.hr_salary_structure_template_items;
CREATE POLICY hr_salary_structure_template_items_scoped ON public.hr_salary_structure_template_items FOR ALL TO authenticated
  USING (public.hr_can_access_payroll_data(auth.uid()))
  WITH CHECK (public.hr_can_access_payroll_data(auth.uid()));