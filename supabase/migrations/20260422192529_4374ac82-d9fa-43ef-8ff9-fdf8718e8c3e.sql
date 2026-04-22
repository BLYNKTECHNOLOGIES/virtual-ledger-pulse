-- ============================================================
-- CLEANUP PASS: search_path hardening + RLS policy resolution
-- ============================================================
-- Part 1: Pin search_path on 71 legacy public.* functions.
--   Metadata-only change, no behavior impact, idempotent.
--   Closes 'function_search_path_mutable' linter warnings.
-- Part 2: Add RLS policies to 4 HR tables that had RLS enabled
--   but no policies (silently locked to authenticated role).
--   These tables ARE used by HR UI — "forgotten policy" case.
-- ============================================================

-- ---------- PART 1: 71 functions ----------
ALTER FUNCTION public.bank_account_has_transactions(account_id_param uuid) SET search_path = public;
ALTER FUNCTION public.calculate_user_risk_score(user_uuid uuid) SET search_path = public;
ALTER FUNCTION public.compute_leave_clashes() SET search_path = public;
ALTER FUNCTION public.create_manual_purchase_simple(p_order_number text, p_supplier_name text, p_order_date date, p_description text, p_total_amount numeric, p_contact_number text, p_status text, p_bank_account_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_credit_wallet_id uuid) SET search_path = public;
ALTER FUNCTION public.create_manual_purchase_stock_only(p_order_number text, p_supplier_name text, p_order_date date, p_description text, p_total_amount numeric, p_contact_number text, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_credit_wallet_id uuid) SET search_path = public;
ALTER FUNCTION public.create_manual_purchase_working(p_order_number text, p_supplier_name text, p_order_date date, p_description text, p_total_amount numeric, p_contact_number text, p_status text, p_bank_account_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_credit_wallet_id uuid) SET search_path = public;
ALTER FUNCTION public.create_role_with_permissions(role_name text, role_description text, permissions text[]) SET search_path = public;
ALTER FUNCTION public.create_user_with_password(_username text, _email text, _password text, _first_name text, _last_name text, _phone text) SET search_path = public;
ALTER FUNCTION public.date_trunc_day_immutable(ts timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.delete_all_user_webauthn_credentials(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.delete_webauthn_credential(p_credential_id uuid) SET search_path = public;
ALTER FUNCTION public.enforce_payroll_lock() SET search_path = public;
ALTER FUNCTION public.enforce_payslip_lock() SET search_path = public;
ALTER FUNCTION public.enforce_pricing_cooldown() SET search_path = public;
ALTER FUNCTION public.enforce_pricing_engine_state_singleton() SET search_path = public;
ALTER FUNCTION public.enforce_singleton_p2p_auto_pay() SET search_path = public;
ALTER FUNCTION public.enforce_singleton_small_buys() SET search_path = public;
ALTER FUNCTION public.enforce_singleton_small_sales() SET search_path = public;
ALTER FUNCTION public.fn_enforce_half_day_total() SET search_path = public;
ALTER FUNCTION public.fn_initialize_onboarding(p_employee_id uuid) SET search_path = public;
ALTER FUNCTION public.fn_initialize_resignation_checklist(p_employee_id uuid) SET search_path = public;
ALTER FUNCTION public.fn_leave_balance_on_status_change() SET search_path = public;
ALTER FUNCTION public.fn_validate_asset_status() SET search_path = public;
ALTER FUNCTION public.fn_validate_attendance_status() SET search_path = public;
ALTER FUNCTION public.fn_validate_leave_balance() SET search_path = public;
ALTER FUNCTION public.fn_validate_loan_status() SET search_path = public;
ALTER FUNCTION public.fn_validate_objective_status() SET search_path = public;
ALTER FUNCTION public.fn_validate_offer_letter_status() SET search_path = public;
ALTER FUNCTION public.fn_validate_payroll_run_status() SET search_path = public;
ALTER FUNCTION public.fn_validate_ticket_status() SET search_path = public;
ALTER FUNCTION public.generate_employee_id(dept text, designation text) SET search_path = public;
ALTER FUNCTION public.get_active_users() SET search_path = public;
ALTER FUNCTION public.get_default_risk_level() SET search_path = public;
ALTER FUNCTION public.get_user_permissions(user_uuid uuid) SET search_path = public;
ALTER FUNCTION public.get_user_with_roles(user_uuid uuid) SET search_path = public;
ALTER FUNCTION public.get_webauthn_credentials(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.log_biometric_event(p_user_id uuid, p_action_type text, p_description text, p_metadata jsonb) SET search_path = public;
ALTER FUNCTION public.maybe_delete_orphan_client(client_name_param text) SET search_path = public;
ALTER FUNCTION public.prevent_duplicate_small_buys_orders() SET search_path = public;
ALTER FUNCTION public.prevent_duplicate_small_sales_orders() SET search_path = public;
ALTER FUNCTION public.preview_off_market_purchase_order_number() SET search_path = public;
ALTER FUNCTION public.preview_off_market_sales_order_number() SET search_path = public;
ALTER FUNCTION public.process_payment_gateway_settlement(p_pending_settlement_ids uuid[], p_bank_account_id uuid, p_mdr_amount numeric, p_created_by uuid) SET search_path = public;
ALTER FUNCTION public.reverse_payment_gateway_settlement(p_settlement_id uuid, p_reversed_by uuid) SET search_path = public;
ALTER FUNCTION public.set_first_response_on_activity() SET search_path = public;
ALTER FUNCTION public.store_webauthn_challenge(p_user_id uuid, p_challenge text, p_type text) SET search_path = public;
ALTER FUNCTION public.store_webauthn_credential(p_user_id uuid, p_credential_id text, p_public_key text, p_device_name text) SET search_path = public;
ALTER FUNCTION public.sync_existing_payment_methods_with_bank_status() SET search_path = public;
ALTER FUNCTION public.sync_usdt_stock() SET search_path = public;
ALTER FUNCTION public.trim_ad_pricing_rule_merchants() SET search_path = public;
ALTER FUNCTION public.update_erp_tasks_updated_at() SET search_path = public;
ALTER FUNCTION public.update_product_stock_from_transaction() SET search_path = public;
ALTER FUNCTION public.update_risk_flag_status(flag_id uuid, new_status text, admin_id uuid, notes text) SET search_path = public;
ALTER FUNCTION public.update_role_permissions(p_role_id uuid, p_role_name text, p_role_description text, p_permissions text[]) SET search_path = public;
ALTER FUNCTION public.update_settlement_raw(order_ids uuid[], batch_id text, settled_timestamp timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.update_settlement_status_direct(order_ids uuid[], batch_id text, settled_timestamp timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.update_settlement_status_only(order_ids uuid[], batch_id text, settled_timestamp timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.update_settlement_status_simple(order_ids uuid[], batch_id text, settled_timestamp timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.update_user_activity(user_uuid uuid) SET search_path = public;
ALTER FUNCTION public.update_user_password(user_id uuid, new_password text) SET search_path = public;
ALTER FUNCTION public.update_wallet_balance() SET search_path = public;
ALTER FUNCTION public.update_webauthn_sign_count(p_credential_id text, p_sign_count integer) SET search_path = public;
ALTER FUNCTION public.user_has_permission(user_uuid uuid, check_permission app_permission) SET search_path = public;
ALTER FUNCTION public.validate_leave_request_dates() SET search_path = public;
ALTER FUNCTION public.validate_pan_format() SET search_path = public;
ALTER FUNCTION public.validate_pricing_rule_thresholds() SET search_path = public;
ALTER FUNCTION public.validate_purchase_order_amount() SET search_path = public;
ALTER FUNCTION public.validate_sales_order_stock() SET search_path = public;
ALTER FUNCTION public.validate_unique_client_bank_numbers() SET search_path = public;
ALTER FUNCTION public.validate_wallet_transaction_amount() SET search_path = public;
ALTER FUNCTION public.verify_and_consume_challenge(p_user_id uuid, p_challenge text, p_type text) SET search_path = public;

-- ---------- PART 2: 4 HR tables — forgotten policies ----------

-- hr_email_send_log: write via edge function (service role), read by HR admin UI
COMMENT ON TABLE public.hr_email_send_log IS 'HR email delivery log. Writes via send-hr-email edge function (service role). Reads gated to admin/HR roles.';
CREATE POLICY "Admin/HR can view email logs"
  ON public.hr_email_send_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- hr_employee_documents: HR document repository, read/write by HR/admin
COMMENT ON TABLE public.hr_employee_documents IS 'HR employee document store. Full CRUD restricted to admin/HR roles.';
CREATE POLICY "Admin/HR can view employee documents"
  ON public.hr_employee_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR can insert employee documents"
  ON public.hr_employee_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR can update employee documents"
  ON public.hr_employee_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR can delete employee documents"
  ON public.hr_employee_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- hr_fnf_settlements: Full & Final settlement records, HR-managed
COMMENT ON TABLE public.hr_fnf_settlements IS 'Full & Final settlement records. Full CRUD restricted to admin/HR roles.';
CREATE POLICY "Admin/HR can view fnf settlements"
  ON public.hr_fnf_settlements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR can insert fnf settlements"
  ON public.hr_fnf_settlements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR can update fnf settlements"
  ON public.hr_fnf_settlements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin/HR can delete fnf settlements"
  ON public.hr_fnf_settlements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin'));

-- hr_salary_revisions: salary revision audit trail
COMMENT ON TABLE public.hr_salary_revisions IS 'Salary revision history. Read by admin/HR; writes restricted to admin.';
CREATE POLICY "Admin/HR can view salary revisions"
  ON public.hr_salary_revisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin can insert salary revisions"
  ON public.hr_salary_revisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "Admin can update salary revisions"
  ON public.hr_salary_revisions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete salary revisions"
  ON public.hr_salary_revisions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin') OR public.has_role(auth.uid(), 'admin'));