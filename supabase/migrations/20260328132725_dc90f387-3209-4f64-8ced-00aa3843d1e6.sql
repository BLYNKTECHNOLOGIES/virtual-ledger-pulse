-- =====================================================
-- PHASE 4 BATCH 3: Binance/Ad/Asset/Beneficiary/Compliance tables
-- =====================================================

-- AD_ACTION_LOGS
DROP POLICY IF EXISTS "Anyone can insert ad action logs" ON public.ad_action_logs;
DROP POLICY IF EXISTS "Anyone can read ad action logs" ON public.ad_action_logs;
CREATE POLICY "authenticated_all_ad_action_logs" ON public.ad_action_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_ad_action_logs" ON public.ad_action_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AD_AUTOMATION_EXCLUSIONS
DROP POLICY IF EXISTS "Allow all for ad_automation_exclusions" ON public.ad_automation_exclusions;
CREATE POLICY "authenticated_all_ad_automation_exclusions" ON public.ad_automation_exclusions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- AD_PAYMENT_METHODS
DROP POLICY IF EXISTS "Authenticated users can delete ad payment methods" ON public.ad_payment_methods;
DROP POLICY IF EXISTS "Authenticated users can insert ad payment methods" ON public.ad_payment_methods;
DROP POLICY IF EXISTS "Authenticated users can read ad payment methods" ON public.ad_payment_methods;
DROP POLICY IF EXISTS "Authenticated users can update ad payment methods" ON public.ad_payment_methods;
CREATE POLICY "authenticated_all_ad_payment_methods" ON public.ad_payment_methods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- AD_PRICING_LOGS
DROP POLICY IF EXISTS "Allow all for ad_pricing_logs" ON public.ad_pricing_logs;
CREATE POLICY "authenticated_all_ad_pricing_logs" ON public.ad_pricing_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_ad_pricing_logs" ON public.ad_pricing_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AD_PRICING_RULES
DROP POLICY IF EXISTS "Allow all for ad_pricing_rules" ON public.ad_pricing_rules;
CREATE POLICY "authenticated_all_ad_pricing_rules" ON public.ad_pricing_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_ad_pricing_rules" ON public.ad_pricing_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AD_REST_TIMER
DROP POLICY IF EXISTS "Anyone can insert rest timer" ON public.ad_rest_timer;
DROP POLICY IF EXISTS "Anyone can update rest timer" ON public.ad_rest_timer;
DROP POLICY IF EXISTS "Anyone can view rest timer" ON public.ad_rest_timer;
CREATE POLICY "authenticated_all_ad_rest_timer" ON public.ad_rest_timer
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_ad_rest_timer" ON public.ad_rest_timer
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ASSET_MOVEMENT_HISTORY
DROP POLICY IF EXISTS "Allow authenticated insert on asset_movement_history" ON public.asset_movement_history;
DROP POLICY IF EXISTS "Allow authenticated select on asset_movement_history" ON public.asset_movement_history;
DROP POLICY IF EXISTS "Allow authenticated update on asset_movement_history" ON public.asset_movement_history;
CREATE POLICY "authenticated_all_asset_movement_history" ON public.asset_movement_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_asset_movement_history" ON public.asset_movement_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ASSET_MOVEMENT_SYNC_METADATA
DROP POLICY IF EXISTS "Allow authenticated insert on movement_sync" ON public.asset_movement_sync_metadata;
DROP POLICY IF EXISTS "Allow authenticated select on movement_sync" ON public.asset_movement_sync_metadata;
DROP POLICY IF EXISTS "Allow authenticated update on movement_sync" ON public.asset_movement_sync_metadata;
CREATE POLICY "authenticated_all_asset_movement_sync_metadata" ON public.asset_movement_sync_metadata
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_asset_movement_sync_metadata" ON public.asset_movement_sync_metadata
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- BENEFICIARY_BANK_ADDITIONS
DROP POLICY IF EXISTS "Allow all access to beneficiary_bank_additions" ON public.beneficiary_bank_additions;
CREATE POLICY "authenticated_all_beneficiary_bank_additions" ON public.beneficiary_bank_additions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BENEFICIARY_RECORDS
DROP POLICY IF EXISTS "Allow all access to beneficiary_records" ON public.beneficiary_records;
CREATE POLICY "authenticated_all_beneficiary_records" ON public.beneficiary_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BINANCE_ORDER_HISTORY
DROP POLICY IF EXISTS "Allow all access to binance_order_history" ON public.binance_order_history;
CREATE POLICY "authenticated_all_binance_order_history" ON public.binance_order_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_binance_order_history" ON public.binance_order_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- BINANCE_SYNC_METADATA
DROP POLICY IF EXISTS "Allow all access to binance_sync_metadata" ON public.binance_sync_metadata;
CREATE POLICY "authenticated_all_binance_sync_metadata" ON public.binance_sync_metadata
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_binance_sync_metadata" ON public.binance_sync_metadata
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- BLOCKED_PHONE_NUMBERS (no policies, enable)
ALTER TABLE IF EXISTS public.blocked_phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_blocked_phone_numbers" ON public.blocked_phone_numbers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CHAT_MESSAGE_SENDERS
DROP POLICY IF EXISTS "Authenticated users can read chat senders" ON public.chat_message_senders;
DROP POLICY IF EXISTS "Authenticated users can insert chat senders" ON public.chat_message_senders;
DROP POLICY IF EXISTS "Service role can manage chat senders" ON public.chat_message_senders;
CREATE POLICY "authenticated_all_chat_message_senders" ON public.chat_message_senders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_chat_message_senders" ON public.chat_message_senders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- COMPLIANCE_DOCUMENTS
DROP POLICY IF EXISTS "Allow all operations on compliance_documents" ON public.compliance_documents;
CREATE POLICY "authenticated_all_compliance_documents" ON public.compliance_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- COUNTERPARTY_CONTACT_RECORDS
DROP POLICY IF EXISTS "Allow all access to counterparty_contact_records" ON public.counterparty_contact_records;
CREATE POLICY "authenticated_all_counterparty_contact_records" ON public.counterparty_contact_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- COUNTERPARTY_PAN_RECORDS
DROP POLICY IF EXISTS "Allow all access to counterparty_pan_records" ON public.counterparty_pan_records;
CREATE POLICY "authenticated_all_counterparty_pan_records" ON public.counterparty_pan_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- DEPARTMENTS
DROP POLICY IF EXISTS "Allow all operations on departments" ON public.departments;
DROP POLICY IF EXISTS "Allow all users to manage departments" ON public.departments;
DROP POLICY IF EXISTS "Allow all users to read departments" ON public.departments;
CREATE POLICY "authenticated_all_departments" ON public.departments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- DOCUMENTS
DROP POLICY IF EXISTS "Allow all operations on documents" ON public.documents;
CREATE POLICY "authenticated_all_documents" ON public.documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- EMPLOYEES
DROP POLICY IF EXISTS "Allow all operations" ON public.employees;
CREATE POLICY "authenticated_all_employees" ON public.employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);