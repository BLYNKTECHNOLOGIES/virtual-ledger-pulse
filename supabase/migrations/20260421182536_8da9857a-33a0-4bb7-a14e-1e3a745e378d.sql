
-- 1) Trusted baseline table: snapshot of correct balances at "Time Zero"
CREATE TABLE IF NOT EXISTS public.erp_balance_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('BANK','WALLET_ASSET')),
  bank_account_id uuid NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  wallet_id uuid NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  asset_code text NULL,
  baseline_balance numeric NOT NULL,
  baseline_at timestamptz NOT NULL DEFAULT now(),
  set_by uuid NULL,
  notes text NULL,
  CONSTRAINT erp_balance_baseline_scope_keys CHECK (
    (scope='BANK' AND bank_account_id IS NOT NULL AND wallet_id IS NULL AND asset_code IS NULL)
    OR (scope='WALLET_ASSET' AND wallet_id IS NOT NULL AND asset_code IS NOT NULL AND bank_account_id IS NULL)
  ),
  UNIQUE (bank_account_id),
  UNIQUE (wallet_id, asset_code)
);

ALTER TABLE public.erp_balance_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read baseline"
  ON public.erp_balance_baseline FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage baseline"
  ON public.erp_balance_baseline FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 2) Live drift report — cached vs ledger, all banks + wallet-assets, no extra operator step
CREATE OR REPLACE VIEW public.erp_balance_drift_report AS
WITH bank_calc AS (
  SELECT bt.bank_account_id,
    COALESCE(SUM(CASE
      WHEN bt.transaction_type IN ('INCOME','TRANSFER_IN') THEN bt.amount
      WHEN bt.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -bt.amount
      ELSE 0 END),0) AS calc
  FROM public.bank_transactions bt
  GROUP BY bt.bank_account_id
),
bank_rows AS (
  SELECT 'BANK'::text AS scope,
    ba.id AS entity_id, ba.account_name AS entity_name,
    NULL::text AS asset_code,
    ba.balance AS cached_balance,
    COALESCE(bc.calc,0) AS ledger_balance,
    ROUND((ba.balance - COALESCE(bc.calc,0))::numeric, 2) AS drift,
    (SELECT MAX(transaction_date) FROM public.bank_transactions WHERE bank_account_id=ba.id) AS last_txn_at
  FROM public.bank_accounts ba
  LEFT JOIN bank_calc bc ON bc.bank_account_id=ba.id
),
wallet_rows AS (
  SELECT 'WALLET_ASSET'::text AS scope,
    wab.wallet_id AS entity_id, w.wallet_name AS entity_name,
    wab.asset_code,
    wab.balance AS cached_balance,
    COALESCE(c.calculated_balance,0) AS ledger_balance,
    ROUND((wab.balance - COALESCE(c.calculated_balance,0))::numeric, 8) AS drift,
    (SELECT MAX(created_at) FROM public.wallet_transactions
       WHERE wallet_id=wab.wallet_id AND asset_code=wab.asset_code) AS last_txn_at
  FROM public.wallet_asset_balances wab
  JOIN public.wallets w ON w.id=wab.wallet_id
  LEFT JOIN public.get_wallet_calculated_balances_per_asset() c
    ON c.wallet_id=wab.wallet_id AND c.asset_code=wab.asset_code
)
SELECT * FROM bank_rows
UNION ALL
SELECT * FROM wallet_rows;

-- 3) Post-baseline drift view — only flags drift introduced AFTER baseline
CREATE OR REPLACE VIEW public.erp_post_baseline_drift AS
SELECT d.*,
  b.baseline_at,
  b.baseline_balance,
  CASE
    WHEN b.baseline_at IS NULL THEN 'NO_BASELINE'
    WHEN ABS(d.drift) <= CASE WHEN d.scope='BANK' THEN 0.01
                              WHEN d.asset_code='USDT' THEN 0.01
                              WHEN d.asset_code IN ('BTC','ETH') THEN 0.0001
                              ELSE 0.001 END THEN 'CLEAN'
    ELSE 'DRIFTED'
  END AS status
FROM public.erp_balance_drift_report d
LEFT JOIN public.erp_balance_baseline b
  ON (d.scope='BANK' AND b.bank_account_id=d.entity_id)
  OR (d.scope='WALLET_ASSET' AND b.wallet_id=d.entity_id AND b.asset_code=d.asset_code);

-- 4) Set / refresh the trusted baseline (snapshot ledger sums as the "truth at this moment")
CREATE OR REPLACE FUNCTION public.set_balance_baseline(_notes text DEFAULT NULL)
RETURNS TABLE(scope text, count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RAISE EXCEPTION 'Only Admin or Super Admin can set the balance baseline';
  END IF;

  -- Banks
  INSERT INTO public.erp_balance_baseline(scope, bank_account_id, baseline_balance, set_by, notes)
  SELECT 'BANK', d.entity_id, d.ledger_balance, v_uid, _notes
  FROM public.erp_balance_drift_report d
  WHERE d.scope='BANK'
  ON CONFLICT (bank_account_id) DO UPDATE
    SET baseline_balance=EXCLUDED.baseline_balance,
        baseline_at=now(),
        set_by=v_uid,
        notes=COALESCE(EXCLUDED.notes, erp_balance_baseline.notes);

  -- Wallet assets
  INSERT INTO public.erp_balance_baseline(scope, wallet_id, asset_code, baseline_balance, set_by, notes)
  SELECT 'WALLET_ASSET', d.entity_id, d.asset_code, d.ledger_balance, v_uid, _notes
  FROM public.erp_balance_drift_report d
  WHERE d.scope='WALLET_ASSET'
  ON CONFLICT (wallet_id, asset_code) DO UPDATE
    SET baseline_balance=EXCLUDED.baseline_balance,
        baseline_at=now(),
        set_by=v_uid,
        notes=COALESCE(EXCLUDED.notes, erp_balance_baseline.notes);

  RETURN QUERY
    SELECT 'BANK'::text, COUNT(*) FROM public.erp_balance_baseline WHERE scope='BANK'
    UNION ALL
    SELECT 'WALLET_ASSET'::text, COUNT(*) FROM public.erp_balance_baseline WHERE scope='WALLET_ASSET';
END;$$;

-- 5) Auto-heal: rewrite every cache to ledger sum, log every change
CREATE OR REPLACE FUNCTION public.heal_all_balance_caches()
RETURNS TABLE(scope text, entity_id uuid, asset_code text, old_balance numeric, new_balance numeric, drift numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_uid uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  -- Banks
  FOR r IN
    SELECT d.entity_id, d.entity_name, d.cached_balance, d.ledger_balance, d.drift
    FROM public.erp_balance_drift_report d
    WHERE d.scope='BANK' AND ABS(d.drift) > 0.01
  LOOP
    UPDATE public.bank_accounts SET balance=r.ledger_balance, updated_at=now() WHERE id=r.entity_id;
    INSERT INTO public.adjustment_posting_audit(wallet_id, wallet_name, asset_code, reference_type, transaction_type, amount, description, notes, posted_by)
    VALUES (r.entity_id, r.entity_name, 'INR', 'BANK_CACHE_HEAL', 'CACHE_REWRITE', r.drift,
            'Auto-heal: bank cache rewritten to ledger sum',
            format('was %s, now %s', r.cached_balance, r.ledger_balance), v_uid);
    scope:='BANK'; entity_id:=r.entity_id; asset_code:='INR';
    old_balance:=r.cached_balance; new_balance:=r.ledger_balance; drift:=r.drift;
    RETURN NEXT;
  END LOOP;

  -- Wallet assets
  FOR r IN
    SELECT d.entity_id, d.entity_name, d.asset_code, d.cached_balance, d.ledger_balance, d.drift
    FROM public.erp_balance_drift_report d
    WHERE d.scope='WALLET_ASSET' AND ABS(d.drift) > 0.0001
  LOOP
    UPDATE public.wallet_asset_balances
       SET balance=r.ledger_balance, updated_at=now()
     WHERE wallet_id=r.entity_id AND asset_code=r.asset_code;
    INSERT INTO public.adjustment_posting_audit(wallet_id, wallet_name, asset_code, reference_type, transaction_type, amount, description, notes, posted_by)
    VALUES (r.entity_id, r.entity_name, r.asset_code, 'WALLET_CACHE_HEAL', 'CACHE_REWRITE', r.drift,
            'Auto-heal: wallet asset cache rewritten to ledger sum',
            format('was %s, now %s', r.cached_balance, r.ledger_balance), v_uid);
    scope:='WALLET_ASSET'; entity_id:=r.entity_id; asset_code:=r.asset_code;
    old_balance:=r.cached_balance; new_balance:=r.ledger_balance; drift:=r.drift;
    RETURN NEXT;
  END LOOP;
END;$$;

GRANT EXECUTE ON FUNCTION public.heal_all_balance_caches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_balance_baseline(text) TO authenticated;
GRANT SELECT ON public.erp_balance_drift_report TO authenticated;
GRANT SELECT ON public.erp_post_baseline_drift TO authenticated;
