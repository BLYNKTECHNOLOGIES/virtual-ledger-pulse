-- Fix 9 tables left with RLS but no policies

CREATE POLICY "authenticated_all_p2p_auto_pay_log" ON public.p2p_auto_pay_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_p2p_auto_pay_log" ON public.p2p_auto_pay_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_p2p_auto_pay_settings" ON public.p2p_auto_pay_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_p2p_auto_pay_settings" ON public.p2p_auto_pay_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_p2p_auto_reply_log" ON public.p2p_auto_reply_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_p2p_auto_reply_log" ON public.p2p_auto_reply_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_p2p_auto_reply_rules" ON public.p2p_auto_reply_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_p2p_auto_reply_rules" ON public.p2p_auto_reply_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_p2p_merchant_schedules" ON public.p2p_merchant_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_p2p_merchant_schedules" ON public.p2p_merchant_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_realized_pnl_events" ON public.realized_pnl_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_reversal_guards" ON public.reversal_guards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_reversal_guards" ON public.reversal_guards FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_spot_trade_history" ON public.spot_trade_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_spot_trade_history" ON public.spot_trade_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_system_action_logs" ON public.system_action_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);