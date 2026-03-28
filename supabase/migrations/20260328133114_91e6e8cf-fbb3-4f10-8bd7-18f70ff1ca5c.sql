-- =====================================================
-- PHASE 4 BATCH 6 FIX: Remaining tables (no IF NOT EXISTS for policies)
-- Since batch 6 failed at usdt_stock, P2P policies were applied but terminal+ weren't
-- =====================================================

-- Check what was already created from partial batch 6 and skip those
-- Terminal tables - the old policies were dropped but new ones weren't created
CREATE POLICY "authenticated_all_terminal_assignment_audit_logs" ON public.terminal_assignment_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_auto_reply_exclusions" ON public.terminal_auto_reply_exclusions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_exchange_accounts" ON public.terminal_exchange_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_internal_chat_reads" ON public.terminal_internal_chat_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_internal_messages" ON public.terminal_internal_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_operator_assignments" ON public.terminal_operator_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_order_assignments" ON public.terminal_order_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_order_size_ranges" ON public.terminal_order_size_ranges FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_terminal_user_profiles" ON public.terminal_user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- USER_ACTIVITY_LOG
DROP POLICY IF EXISTS "Allow all operations on user_activity_log" ON public.user_activity_log;
CREATE POLICY "authenticated_all_user_activity_log" ON public.user_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- EMAIL tables
ALTER TABLE IF EXISTS public.email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_email_send_log" ON public.email_send_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_email_send_log" ON public.email_send_log FOR SELECT TO authenticated USING (true);

ALTER TABLE IF EXISTS public.email_send_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_email_send_state" ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_email_send_state" ON public.email_send_state FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all operations on email_notification_log" ON public.email_notification_log;
ALTER TABLE IF EXISTS public.email_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_email_notification_log" ON public.email_notification_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_email_notification_log" ON public.email_notification_log FOR SELECT TO authenticated USING (true);

ALTER TABLE IF EXISTS public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_email_unsubscribe_tokens" ON public.email_unsubscribe_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- EMPLOYEE_OFFBOARDING
ALTER TABLE IF EXISTS public.employee_offboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_employee_offboarding" ON public.employee_offboarding FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PASSWORD_RESET_REQUESTS
ALTER TABLE IF EXISTS public.password_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_password_reset" ON public.password_reset_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_all_password_reset" ON public.password_reset_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_password_reset" ON public.password_reset_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- TERMINAL BIOMETRIC/WEBAUTHN tables
ALTER TABLE IF EXISTS public.terminal_biometric_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_biometric_sessions" ON public.terminal_biometric_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.terminal_bypass_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_bypass_codes" ON public.terminal_bypass_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.terminal_webauthn_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_webauthn_challenges" ON public.terminal_webauthn_challenges FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_terminal_webauthn_challenges" ON public.terminal_webauthn_challenges FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.terminal_webauthn_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_webauthn_credentials" ON public.terminal_webauthn_credentials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_terminal_webauthn_credentials" ON public.terminal_webauthn_credentials FOR SELECT TO anon USING (true);

-- HR tables without policies
ALTER TABLE IF EXISTS public.hr_compoff_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_hr_compoff_credits" ON public.hr_compoff_credits FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.hr_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_hr_penalties" ON public.hr_penalties FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.hr_penalty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_hr_penalty_rules" ON public.hr_penalty_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PERFORMANCE tables
ALTER TABLE IF EXISTS public.performance_review_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_performance_review_criteria" ON public.performance_review_criteria FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.performance_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_performance_reviews" ON public.performance_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SUPPRESSED_EMAILS
ALTER TABLE IF EXISTS public.suppressed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_suppressed_emails" ON public.suppressed_emails FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ERP_DRIFT_ALERTS
ALTER TABLE IF EXISTS public.erp_drift_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_erp_drift_alerts" ON public.erp_drift_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erp_drift_alerts" ON public.erp_drift_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);