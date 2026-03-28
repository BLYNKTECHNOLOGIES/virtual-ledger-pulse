-- Fix 26 tables that have RLS enabled but no policies (old ones dropped, new ones never created)

CREATE POLICY "authenticated_all_pending_registrations" ON public.pending_registrations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_platforms" ON public.platforms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_positions" ON public.positions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_purchase_action_timings" ON public.purchase_action_timings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_purchase_order_payments" ON public.purchase_order_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_purchase_order_reviews" ON public.purchase_order_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_purchase_order_status_history" ON public.purchase_order_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_purchase_payment_methods" ON public.purchase_payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_rekyc_requests" ON public.rekyc_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_risk_detection_logs" ON public.risk_detection_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_risk_flags" ON public.risk_flags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_sales_order_items" ON public.sales_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_sales_payment_methods" ON public.sales_payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_buys_config" ON public.small_buys_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_buys_order_map" ON public.small_buys_order_map FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_buys_sync" ON public.small_buys_sync FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_buys_sync_log" ON public.small_buys_sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_sales_config" ON public.small_sales_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_sales_order_map" ON public.small_sales_order_map FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_sales_sync" ON public.small_sales_sync FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_small_sales_sync_log" ON public.small_sales_sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_stock_adjustments" ON public.stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_subsidiaries" ON public.subsidiaries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_system_settings" ON public.system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_tds_records" ON public.tds_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also add service_role for tables that edge functions write to
CREATE POLICY "service_all_small_buys_sync" ON public.small_buys_sync FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_small_buys_sync_log" ON public.small_buys_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_small_sales_sync" ON public.small_sales_sync FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_small_sales_sync_log" ON public.small_sales_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_stock_adjustments" ON public.stock_adjustments FOR ALL TO service_role USING (true) WITH CHECK (true);