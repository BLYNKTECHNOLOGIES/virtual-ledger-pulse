-- =====================================================
-- PHASE 4 BATCH 2: Financial + Operational Tables
-- =====================================================

-- BANK_ACCOUNTS
DROP POLICY IF EXISTS "Allow all operations" ON public.bank_accounts;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.bank_accounts;
CREATE POLICY "authenticated_read_bank_accounts" ON public.bank_accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers_write_bank_accounts" ON public.bank_accounts
  FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "managers_update_bank_accounts" ON public.bank_accounts
  FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "superadmin_delete_bank_accounts" ON public.bank_accounts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super admin'));

-- BANK_TRANSACTIONS
DROP POLICY IF EXISTS "Allow all operations on bank_transactions" ON public.bank_transactions;
CREATE POLICY "authenticated_all_bank_transactions" ON public.bank_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BANK_CASES
DROP POLICY IF EXISTS "Allow all operations on bank_cases" ON public.bank_cases;
CREATE POLICY "authenticated_all_bank_cases" ON public.bank_cases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BANK_COMMUNICATIONS
DROP POLICY IF EXISTS "Allow all operations on bank_communications" ON public.bank_communications;
CREATE POLICY "authenticated_all_bank_communications" ON public.bank_communications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLOSED_BANK_ACCOUNTS
DROP POLICY IF EXISTS "Allow all operations on closed_bank_accounts" ON public.closed_bank_accounts;
CREATE POLICY "authenticated_all_closed_bank_accounts" ON public.closed_bank_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ACCOUNT_INVESTIGATIONS
DROP POLICY IF EXISTS "Allow all operations on account_investigations" ON public.account_investigations;
DROP POLICY IF EXISTS "Allow creating account investigations" ON public.account_investigations;
DROP POLICY IF EXISTS "Allow reading account investigations" ON public.account_investigations;
CREATE POLICY "authenticated_all_account_investigations" ON public.account_investigations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLIENTS
DROP POLICY IF EXISTS "Allow all operations" ON public.clients;
CREATE POLICY "authenticated_all_clients" ON public.clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLIENT_COMMUNICATION_LOGS
DROP POLICY IF EXISTS "Allow all operations on client_communication_logs" ON public.client_communication_logs;
CREATE POLICY "authenticated_all_client_communication_logs" ON public.client_communication_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLIENT_LIMIT_REQUESTS
DROP POLICY IF EXISTS "Allow all access to client_limit_requests" ON public.client_limit_requests;
CREATE POLICY "authenticated_all_client_limit_requests" ON public.client_limit_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLIENT_ONBOARDING_APPROVALS
DROP POLICY IF EXISTS "Allow all operations on client_onboarding_approvals" ON public.client_onboarding_approvals;
CREATE POLICY "authenticated_all_client_onboarding_approvals" ON public.client_onboarding_approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PURCHASE_ORDERS
DROP POLICY IF EXISTS "Allow all operations on purchase_orders" ON public.purchase_orders;
CREATE POLICY "authenticated_all_purchase_orders" ON public.purchase_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_purchase_orders" ON public.purchase_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PURCHASE_ORDER_ITEMS
DROP POLICY IF EXISTS "Allow all operations on purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "authenticated_all_purchase_order_items" ON public.purchase_order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PURCHASE_ORDER_PAYMENT_SPLITS
DROP POLICY IF EXISTS "Allow all operations on purchase_order_payment_splits" ON public.purchase_order_payment_splits;
CREATE POLICY "authenticated_all_purchase_order_payment_splits" ON public.purchase_order_payment_splits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SALES_ORDERS
DROP POLICY IF EXISTS "Allow all operations on sales_orders" ON public.sales_orders;
CREATE POLICY "authenticated_all_sales_orders" ON public.sales_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_sales_orders" ON public.sales_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PAYMENT_METHODS
DROP POLICY IF EXISTS "Allow all operations on payment_methods" ON public.payment_methods;
CREATE POLICY "authenticated_all_payment_methods" ON public.payment_methods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PAYMENT_METHODS_MASTER
DROP POLICY IF EXISTS "Allow all operations on payment_methods_master" ON public.payment_methods_master;
CREATE POLICY "authenticated_all_payment_methods_master" ON public.payment_methods_master
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PAYMENT_GATEWAY_SETTLEMENTS
DROP POLICY IF EXISTS "Allow all operations on payment_gateway_settlements" ON public.payment_gateway_settlements;
CREATE POLICY "authenticated_all_payment_gateway_settlements" ON public.payment_gateway_settlements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PAYMENT_GATEWAY_SETTLEMENT_ITEMS
DROP POLICY IF EXISTS "Allow all operations on payment_gateway_settlement_items" ON public.payment_gateway_settlement_items;
CREATE POLICY "authenticated_all_payment_gateway_settlement_items" ON public.payment_gateway_settlement_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PENDING_SETTLEMENTS
DROP POLICY IF EXISTS "Allow all operations on pending_settlements" ON public.pending_settlements;
CREATE POLICY "authenticated_all_pending_settlements" ON public.pending_settlements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- JOURNAL_ENTRIES
DROP POLICY IF EXISTS "Allow all operations on journal_entries" ON public.journal_entries;
CREATE POLICY "authenticated_all_journal_entries" ON public.journal_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LEDGER_ACCOUNTS
DROP POLICY IF EXISTS "Allow all operations on ledger_accounts" ON public.ledger_accounts;
CREATE POLICY "authenticated_all_ledger_accounts" ON public.ledger_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- WALLETS
DROP POLICY IF EXISTS "Allow all operations on wallets" ON public.wallets;
CREATE POLICY "authenticated_all_wallets" ON public.wallets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- WALLET_TRANSACTIONS
DROP POLICY IF EXISTS "Allow all operations on wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "authenticated_all_wallet_transactions" ON public.wallet_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_wallet_transactions" ON public.wallet_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- WALLET_ASSET_BALANCES
DROP POLICY IF EXISTS "Allow all operations on wallet_asset_balances" ON public.wallet_asset_balances;
CREATE POLICY "authenticated_all_wallet_asset_balances" ON public.wallet_asset_balances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CONVERSION_JOURNAL_ENTRIES
DROP POLICY IF EXISTS "Allow all access to conversion_journal_entries" ON public.conversion_journal_entries;
CREATE POLICY "authenticated_all_conversion_journal_entries" ON public.conversion_journal_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ERP_PRODUCT_CONVERSIONS
DROP POLICY IF EXISTS "Allow all read access on erp_product_conversions" ON public.erp_product_conversions;
DROP POLICY IF EXISTS "Allow all update access on erp_product_conversions" ON public.erp_product_conversions;
DROP POLICY IF EXISTS "Allow all insert access on erp_product_conversions" ON public.erp_product_conversions;
DROP POLICY IF EXISTS "Allow all delete access on erp_product_conversions" ON public.erp_product_conversions;
CREATE POLICY "authenticated_all_erp_product_conversions" ON public.erp_product_conversions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ERP_BALANCE_SNAPSHOTS
DROP POLICY IF EXISTS "Allow all operations on erp_balance_snapshots" ON public.erp_balance_snapshots;
CREATE POLICY "authenticated_all_erp_balance_snapshots" ON public.erp_balance_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erp_balance_snapshots" ON public.erp_balance_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ERP_BALANCE_SNAPSHOT_LINES
DROP POLICY IF EXISTS "Allow all operations on erp_balance_snapshot_lines" ON public.erp_balance_snapshot_lines;
CREATE POLICY "authenticated_all_erp_balance_snapshot_lines" ON public.erp_balance_snapshot_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erp_balance_snapshot_lines" ON public.erp_balance_snapshot_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- DAILY_GROSS_PROFIT_HISTORY
DROP POLICY IF EXISTS "Anyone can read daily gross profit history" ON public.daily_gross_profit_history;
DROP POLICY IF EXISTS "Service role can update gross profit history" ON public.daily_gross_profit_history;
DROP POLICY IF EXISTS "Service role can insert gross profit history" ON public.daily_gross_profit_history;
CREATE POLICY "authenticated_read_daily_gross_profit" ON public.daily_gross_profit_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all_daily_gross_profit" ON public.daily_gross_profit_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ASSET_VALUE_HISTORY
DROP POLICY IF EXISTS "Anyone can read asset value history" ON public.asset_value_history;
DROP POLICY IF EXISTS "Authenticated users can view asset value history" ON public.asset_value_history;
DROP POLICY IF EXISTS "Service role can insert asset value history" ON public.asset_value_history;
CREATE POLICY "authenticated_read_asset_value_history" ON public.asset_value_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all_asset_value_history" ON public.asset_value_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);