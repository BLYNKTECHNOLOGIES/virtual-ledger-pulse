-- PHASE 4 FINAL SWEEP: Drop all remaining old {public} write policies + stale anon/authenticated duplicates

-- P2P tables: old INSERT policies coexist with new authenticated_all_*
DROP POLICY IF EXISTS "Anyone can insert auto pay logs" ON public.p2p_auto_pay_log;
DROP POLICY IF EXISTS "Anyone can view auto pay logs" ON public.p2p_auto_pay_log;
DROP POLICY IF EXISTS "Anyone can insert auto pay settings" ON public.p2p_auto_pay_settings;
DROP POLICY IF EXISTS "Anyone can view auto pay settings" ON public.p2p_auto_pay_settings;
DROP POLICY IF EXISTS "Anyone can insert auto reply logs" ON public.p2p_auto_reply_log;
DROP POLICY IF EXISTS "Anyone can view auto reply logs" ON public.p2p_auto_reply_log;
DROP POLICY IF EXISTS "Service role can insert processed records" ON public.p2p_auto_reply_processed;
DROP POLICY IF EXISTS "Anyone can view processed records" ON public.p2p_auto_reply_processed;
DROP POLICY IF EXISTS "Anyone can insert auto reply rules" ON public.p2p_auto_reply_rules;
DROP POLICY IF EXISTS "Anyone can view auto reply rules" ON public.p2p_auto_reply_rules;
DROP POLICY IF EXISTS "Anyone can insert schedules" ON public.p2p_merchant_schedules;
DROP POLICY IF EXISTS "Anyone can view schedules" ON public.p2p_merchant_schedules;

-- REALIZED_PNL_EVENTS
DROP POLICY IF EXISTS "Authenticated users can insert pnl events" ON public.realized_pnl_events;
DROP POLICY IF EXISTS "Authenticated users can view pnl events" ON public.realized_pnl_events;

-- REVERSAL_GUARDS - old policy was restrictive but targeting {public}
DROP POLICY IF EXISTS "No direct access to reversal guards" ON public.reversal_guards;

-- SPOT_TRADE_HISTORY
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.spot_trade_history;
DROP POLICY IF EXISTS "Allow authenticated select" ON public.spot_trade_history;

-- SYSTEM_ACTION_LOGS
DROP POLICY IF EXISTS "Allow creating action logs" ON public.system_action_logs;
DROP POLICY IF EXISTS "Allow reading action logs" ON public.system_action_logs;

-- TERMINAL_ASSIGNMENT_AUDIT_LOGS
DROP POLICY IF EXISTS "Assignment audit logs insertable" ON public.terminal_assignment_audit_logs;
DROP POLICY IF EXISTS "Assignment audit logs readable" ON public.terminal_assignment_audit_logs;

-- USER_ACTIVITY_LOG
DROP POLICY IF EXISTS "System can insert activity logs" ON public.user_activity_log;
DROP POLICY IF EXISTS "Users can view activity logs" ON public.user_activity_log;

-- USER_PREFERENCES - replace with authenticated
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.user_preferences;
CREATE POLICY "authenticated_all_user_preferences" ON public.user_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- USER_SIDEBAR_PREFERENCES - replace with authenticated
DROP POLICY IF EXISTS "Users can create their own sidebar preferences" ON public.user_sidebar_preferences;
DROP POLICY IF EXISTS "Users can update their own sidebar preferences" ON public.user_sidebar_preferences;
DROP POLICY IF EXISTS "Users can view their own sidebar preferences" ON public.user_sidebar_preferences;
CREATE POLICY "authenticated_all_user_sidebar_preferences" ON public.user_sidebar_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- WALLET_ASSET_BALANCES
DROP POLICY IF EXISTS "Anyone can insert wallet asset balances" ON public.wallet_asset_balances;
DROP POLICY IF EXISTS "Anyone can read wallet asset balances" ON public.wallet_asset_balances;
DROP POLICY IF EXISTS "Anyone can update wallet asset balances" ON public.wallet_asset_balances;

-- WALLET_ASSET_POSITIONS - replace with authenticated
DROP POLICY IF EXISTS "Allow read access to wallet_asset_positions" ON public.wallet_asset_positions;
DROP POLICY IF EXISTS "Authenticated users can insert positions" ON public.wallet_asset_positions;
DROP POLICY IF EXISTS "Authenticated users can update positions" ON public.wallet_asset_positions;
CREATE POLICY "authenticated_all_wallet_asset_positions" ON public.wallet_asset_positions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SHIFT_RECONCILIATIONS: drop stale duplicates
DROP POLICY IF EXISTS "Allow anon select on shift_reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Authenticated users can insert shift reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Authenticated users can update shift reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Authenticated users can view shift reconciliations" ON public.shift_reconciliations;