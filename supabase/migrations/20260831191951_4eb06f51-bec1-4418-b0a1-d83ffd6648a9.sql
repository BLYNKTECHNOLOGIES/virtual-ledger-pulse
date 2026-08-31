
-- 1) SECURITY DEFINER view
ALTER VIEW public.hr_attendance_day_v SET (security_invoker = on);

-- 2) ERP reconciliation snapshots / lines / drift alerts
DROP POLICY IF EXISTS "authenticated_all_erp_balance_snapshots" ON public.erp_balance_snapshots;
DROP POLICY IF EXISTS "Service role can insert snapshots" ON public.erp_balance_snapshots;

DROP POLICY IF EXISTS "authenticated_all_erp_balance_snapshot_lines" ON public.erp_balance_snapshot_lines;
DROP POLICY IF EXISTS "Service role can insert snapshot lines" ON public.erp_balance_snapshot_lines;

DROP POLICY IF EXISTS "authenticated_all_erp_drift_alerts" ON public.erp_drift_alerts;

CREATE POLICY "drift_alerts_ack_authenticated"
ON public.erp_drift_alerts FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.erp_balance_snapshots FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.erp_balance_snapshot_lines FROM authenticated;
REVOKE INSERT, DELETE ON public.erp_drift_alerts FROM authenticated;
GRANT ALL ON public.erp_balance_snapshots TO service_role;
GRANT ALL ON public.erp_balance_snapshot_lines TO service_role;
GRANT ALL ON public.erp_drift_alerts TO service_role;

-- 3) HR offer letter / deposit policy: HR staff only for writes
DROP POLICY IF EXISTS "hr_offer_letter_policy_write" ON public.hr_offer_letter_policy;
CREATE POLICY "hr_offer_letter_policy_write_hr_only"
ON public.hr_offer_letter_policy FOR ALL TO authenticated
USING (public.hr_is_hr_staff(auth.uid()))
WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- 4) wallet_transactions inserts limited to order/banking managers
DROP POLICY IF EXISTS "wallet_tx_insert" ON public.wallet_transactions;
CREATE POLICY "wallet_tx_insert_privileged"
ON public.wallet_transactions FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_orders(auth.uid())
  OR public.can_manage_banking(auth.uid())
);
