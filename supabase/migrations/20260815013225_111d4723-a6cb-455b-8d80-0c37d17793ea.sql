-- =========================================================
-- Phase 1: fin_* reporting views/functions (read-only)
-- =========================================================

-- 1. Inter-company transfer pairs (deduplicated)
CREATE OR REPLACE VIEW public.fin_intercompany_v AS
WITH legs AS (
  SELECT
    x.id                       AS leg_id,
    x.transaction_type         AS leg_type,
    x.amount                   AS leg_amount,
    x.transaction_date         AS leg_date,
    x.description              AS leg_description,
    x.bank_account_id          AS leg_bank_account_id,
    a.subsidiary_id            AS leg_subsidiary_id,
    r.id                       AS counter_leg_id,
    r.transaction_type         AS counter_type,
    r.amount                   AS counter_amount,
    r.transaction_date         AS counter_date,
    r.bank_account_id          AS counter_bank_account_id,
    b.subsidiary_id            AS counter_subsidiary_id,
    (r.related_transaction_id = x.id) AS mutual
  FROM public.bank_transactions x
  JOIN public.bank_accounts    a ON a.id = x.bank_account_id
  JOIN public.bank_transactions r ON r.id = x.related_transaction_id
  JOIN public.bank_accounts    b ON b.id = r.bank_account_id
  WHERE x.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
    AND a.subsidiary_id IS DISTINCT FROM b.subsidiary_id
)
SELECT
  l.leg_id,
  l.counter_leg_id,
  CASE WHEN COALESCE(l.mutual,false) THEN 'MUTUAL' ELSE 'ONE_WAY' END AS pairing,
  CASE WHEN l.leg_type = 'TRANSFER_OUT' THEN l.leg_subsidiary_id     ELSE l.counter_subsidiary_id END AS from_subsidiary_id,
  CASE WHEN l.leg_type = 'TRANSFER_OUT' THEN l.counter_subsidiary_id ELSE l.leg_subsidiary_id     END AS to_subsidiary_id,
  CASE WHEN l.leg_type = 'TRANSFER_OUT' THEN l.leg_bank_account_id     ELSE l.counter_bank_account_id END AS from_bank_account_id,
  CASE WHEN l.leg_type = 'TRANSFER_OUT' THEN l.counter_bank_account_id ELSE l.leg_bank_account_id     END AS to_bank_account_id,
  CASE WHEN l.leg_type = 'TRANSFER_OUT' THEN l.leg_amount ELSE l.counter_amount END AS out_amount,
  CASE WHEN l.leg_type = 'TRANSFER_OUT' THEN l.counter_amount ELSE l.leg_amount END AS in_amount,
  abs(l.leg_amount - l.counter_amount) > 0.01 AS amount_mismatch,
  LEAST(l.leg_date, l.counter_date)  AS transfer_date,
  l.leg_description
FROM legs l
WHERE l.leg_type = 'TRANSFER_OUT' OR COALESCE(l.mutual,false) = false;

GRANT SELECT ON public.fin_intercompany_v TO authenticated, service_role;

-- 2. Net inter-company position per entity / counterparty
CREATE OR REPLACE VIEW public.fin_intercompany_position_v AS
WITH directional AS (
  SELECT from_subsidiary_id AS subsidiary_id, to_subsidiary_id AS counterparty_subsidiary_id,
         out_amount AS funded_amount, 0::numeric AS received_amount, transfer_date
  FROM public.fin_intercompany_v
  UNION ALL
  SELECT to_subsidiary_id, from_subsidiary_id,
         0::numeric, in_amount, transfer_date
  FROM public.fin_intercompany_v
)
SELECT
  d.subsidiary_id,
  d.counterparty_subsidiary_id,
  se.firm_name AS legal_name,
  ce.firm_name AS counterparty_legal_name,
  sum(d.funded_amount)   AS funded_to_counterparty,
  sum(d.received_amount) AS received_from_counterparty,
  sum(d.funded_amount) - sum(d.received_amount) AS net_position,
  max(d.transfer_date)   AS last_movement_date,
  count(*)               AS movement_count
FROM directional d
LEFT JOIN public.subsidiaries se ON se.id = d.subsidiary_id
LEFT JOIN public.subsidiaries ce ON ce.id = d.counterparty_subsidiary_id
GROUP BY d.subsidiary_id, d.counterparty_subsidiary_id, se.firm_name, ce.firm_name;

GRANT SELECT ON public.fin_intercompany_position_v TO authenticated, service_role;

-- 3. Transfers that cannot be paired
CREATE OR REPLACE VIEW public.fin_transfer_unpaired_v AS
SELECT
  t.id, t.bank_account_id, ba.subsidiary_id, ba.account_name, ba.bank_name,
  t.transaction_type, t.amount, t.transaction_date, t.description, t.reference_number,
  CASE
    WHEN t.related_transaction_id IS NULL THEN 'NO_COUNTERPARTY_LINK'
    ELSE 'COUNTERPARTY_ROW_MISSING'
  END AS reason
FROM public.bank_transactions t
JOIN public.bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
  AND (
    t.related_transaction_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.bank_transactions r WHERE r.id = t.related_transaction_id)
  );

GRANT SELECT ON public.fin_transfer_unpaired_v TO authenticated, service_role;

-- 4. Bank accounts with no baseline anchor
CREATE OR REPLACE VIEW public.fin_unanchored_accounts_v AS
SELECT
  ba.id AS bank_account_id, ba.subsidiary_id, ba.account_name, ba.bank_name,
  ba.balance AS cached_balance,
  (SELECT count(*) FROM public.bank_transactions t WHERE t.bank_account_id = ba.id) AS txn_count
FROM public.bank_accounts ba
WHERE NOT EXISTS (
  SELECT 1 FROM public.erp_balance_baseline b
  WHERE b.bank_account_id = ba.id
);

GRANT SELECT ON public.fin_unanchored_accounts_v TO authenticated, service_role;

-- 5. Adjustment / exclusion disclosure (never silently dropped)
CREATE OR REPLACE VIEW public.fin_exclusion_disclosure_v AS
SELECT 'MANUAL_BASELINE_RESET'::text AS bucket,
       'Manual Baseline Reset entries'::text AS label,
       ba.subsidiary_id, count(*) AS entry_count, sum(abs(t.amount)) AS gross_amount
FROM public.bank_transactions t
JOIN public.bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.category = 'Manual Baseline Reset'
GROUP BY ba.subsidiary_id
UNION ALL
SELECT 'ADJUSTMENT_CATEGORY', 'Transactions categorised as ADJUSTMENT',
       ba.subsidiary_id, count(*), sum(abs(t.amount))
FROM public.bank_transactions t
JOIN public.bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.category = 'ADJUSTMENT'
GROUP BY ba.subsidiary_id
UNION ALL
SELECT 'BALANCE_ADJUSTMENT_ACCOUNT', 'Movements on the Balance Adjustment Account',
       ba.subsidiary_id, count(*), sum(abs(t.amount))
FROM public.bank_transactions t
JOIN public.bank_accounts ba ON ba.id = t.bank_account_id
WHERE lower(btrim(coalesce(ba.account_name,''))) = 'balance adjustment account'
GROUP BY ba.subsidiary_id;

GRANT SELECT ON public.fin_exclusion_disclosure_v TO authenticated, service_role;

-- 6. Genesis-aware hash chain check
CREATE OR REPLACE VIEW public.fin_hash_chain_check_v AS
WITH ordered AS (
  SELECT
    t.id, t.bank_account_id, t.sequence_no, t.prev_hash, t.row_hash, t.transaction_date, t.amount,
    row_number() OVER (PARTITION BY t.bank_account_id ORDER BY t.sequence_no NULLS LAST, t.created_at) AS rn,
    lag(t.row_hash) OVER (PARTITION BY t.bank_account_id ORDER BY t.sequence_no NULLS LAST, t.created_at) AS expected_prev_hash
  FROM public.bank_transactions t
)
SELECT
  o.id, o.bank_account_id, ba.subsidiary_id, ba.account_name,
  o.sequence_no, o.rn, o.transaction_date, o.amount,
  CASE
    WHEN o.rn = 1 AND o.prev_hash IS NULL THEN 'GENESIS'
    WHEN o.rn > 1 AND o.prev_hash IS NULL THEN 'BREAK_NULL_PREV_HASH'
    WHEN o.rn > 1 AND o.expected_prev_hash IS NOT NULL AND o.prev_hash IS DISTINCT FROM o.expected_prev_hash
         THEN 'BREAK_PREV_HASH_MISMATCH'
    ELSE 'OK'
  END AS chain_status
FROM ordered o
JOIN public.bank_accounts ba ON ba.id = o.bank_account_id;

GRANT SELECT ON public.fin_hash_chain_check_v TO authenticated, service_role;

-- 7. Opening position rolled BACKWARDS from the baseline anchor
CREATE OR REPLACE FUNCTION public.fin_entity_opening_position(
  p_subsidiary_id uuid,
  p_opening_date  date DEFAULT date '2026-04-01'
)
RETURNS TABLE(
  bank_account_id uuid,
  account_name text,
  bank_name text,
  anchor_balance numeric,
  anchor_at timestamptz,
  movement_between numeric,
  derived_opening_balance numeric,
  basis text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    ba.id,
    ba.account_name,
    ba.bank_name,
    b.baseline_balance,
    b.baseline_at,
    COALESCE(mv.net_movement, 0) AS movement_between,
    CASE WHEN b.baseline_balance IS NULL THEN NULL
         ELSE b.baseline_balance - COALESCE(mv.net_movement, 0) END AS derived_opening_balance,
    CASE WHEN b.baseline_balance IS NULL THEN 'UNANCHORED_NO_BASELINE'
         ELSE 'ROLLED_BACK_FROM_ANCHOR' END AS basis
  FROM public.bank_accounts ba
  LEFT JOIN LATERAL (
    SELECT eb.baseline_balance, eb.baseline_at
    FROM public.erp_balance_baseline eb
    WHERE eb.bank_account_id = ba.id
    ORDER BY eb.baseline_at DESC
    LIMIT 1
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT sum(
             CASE WHEN t.transaction_type IN ('INCOME','TRANSFER_IN') THEN t.amount
                  WHEN t.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -t.amount
                  ELSE 0 END) AS net_movement
    FROM public.bank_transactions t
    WHERE t.bank_account_id = ba.id
      AND b.baseline_at IS NOT NULL
      AND t.transaction_date >= p_opening_date
      AND t.transaction_date <= b.baseline_at
  ) mv ON true
  WHERE ba.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id;
$$;

GRANT EXECUTE ON FUNCTION public.fin_entity_opening_position(uuid, date) TO authenticated, service_role;

-- 8. Integrity panel revision
CREATE OR REPLACE FUNCTION public.fin_entity_integrity(p_subsidiary_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS TABLE(severity text, code text, title text, detail text, impact_amount numeric, affected_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'warning'::text, 'ENTITY_MASTER_INCOMPLETE'::text, 'Entity registration details incomplete'::text,
         'GST/PAN missing or invalid on the company master record'::text, NULL::numeric, 1::bigint
  FROM public.fin_entity_master_v e
  WHERE e.subsidiary_id = p_subsidiary_id AND (e.gst_missing_or_invalid OR e.pan_missing_or_invalid);

  RETURN QUERY
  SELECT 'critical', 'BANK_DRIFT', 'Bank ledger does not match stored balance',
         string_agg(bp.account_name || ' (' || round(bp.drift,2)::text || ')', ', '),
         sum(abs(bp.drift)), count(*)
  FROM public.fin_entity_bank_position(p_subsidiary_id, p_as_of) bp
  WHERE bp.drift IS NOT NULL AND abs(bp.drift) > 0.01
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'critical', 'NO_LEDGER_HISTORY', 'Bank account has no posted transactions',
         string_agg(bp.account_name, ', '), sum(bp.ledger_balance), count(*)
  FROM public.fin_entity_bank_position(p_subsidiary_id, p_as_of) bp
  WHERE bp.txn_count = 0
  HAVING count(*) > 0;

  -- Genesis-aware hash chain: genesis rows are informational, never failures
  RETURN QUERY
  SELECT 'critical', 'LEDGER_HASH_CHAIN_BREAK', 'Bank ledger hash chain is broken',
         string_agg(DISTINCT h.account_name, ', '), NULL::numeric, count(*)
  FROM public.fin_hash_chain_check_v h
  WHERE h.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id
    AND h.chain_status LIKE 'BREAK%'
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'info', 'LEDGER_HASH_CHAIN_GENESIS', 'First transaction of each account (expected)',
         'These rows carry no previous hash because they open the chain for their account; this is not a break',
         NULL::numeric, count(*)
  FROM public.fin_hash_chain_check_v h
  WHERE h.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id
    AND h.chain_status = 'GENESIS'
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'critical', 'TRANSFER_UNPAIRED', 'Transfers with no matching counterparty entry',
         'These movements changed the bank balance but cannot be paired with the other side of the transfer',
         sum(abs(u.amount)), count(*)
  FROM public.fin_transfer_unpaired_v u
  WHERE u.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id
    AND u.transaction_date <= p_as_of
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'TRANSFER_FLOW_GAP', 'Group transfers out do not equal transfers in',
         'Total TRANSFER_OUT and TRANSFER_IN across the group differ; the gap is shown gross and not netted away',
         abs(sum(CASE WHEN t.transaction_type = 'TRANSFER_OUT' THEN t.amount ELSE -t.amount END)),
         count(*)
  FROM public.bank_transactions t
  WHERE t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
    AND t.transaction_date <= p_as_of
  HAVING abs(sum(CASE WHEN t.transaction_type = 'TRANSFER_OUT' THEN t.amount ELSE -t.amount END)) > 0.01;

  RETURN QUERY
  SELECT 'warning', 'INTERCOMPANY_POSITION', 'Funds moved between group companies',
         string_agg(p.counterparty_legal_name || ': ' || round(p.net_position,2)::text, ', '),
         sum(abs(p.net_position)), count(*)
  FROM public.fin_intercompany_position_v p
  WHERE p.subsidiary_id = p_subsidiary_id
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'critical', 'INTERCOMPANY_AMOUNT_MISMATCH', 'Paired inter-company transfers differ in amount',
         'The amount leaving one company does not equal the amount arriving in the other',
         sum(abs(ic.out_amount - ic.in_amount)), count(*)
  FROM public.fin_intercompany_v ic
  WHERE (ic.from_subsidiary_id = p_subsidiary_id OR ic.to_subsidiary_id = p_subsidiary_id)
    AND ic.amount_mismatch
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'UNANCHORED_ACCOUNT', 'Bank account has no baseline anchor',
         string_agg(ua.account_name || ' / ' || ua.bank_name, ', '),
         sum(ua.cached_balance), count(*)
  FROM public.fin_unanchored_accounts_v ua
  WHERE ua.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'info', 'EXCLUSION_DISCLOSED', 'Adjustment buckets disclosed, not hidden',
         string_agg(d.label || ': ' || d.entry_count::text || ' entries / ' || round(d.gross_amount,2)::text, '; '),
         sum(d.gross_amount), sum(d.entry_count)
  FROM public.fin_exclusion_disclosure_v d
  WHERE d.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'UNCLASSIFIED_CATEGORY', 'Transactions with no reporting treatment',
         string_agg(DISTINCT t.category_top, ', '), sum(abs(t.amount)), count(*)
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id AND t.transaction_date <= p_as_of
    AND t.bs_section = 'UNCLASSIFIED'
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'CAPEX_EXPENSED', 'Capital spend charged to expense',
         'No fixed-asset register exists, so these amounts do not appear as assets',
         sum(abs(t.amount)), count(*)
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id AND t.transaction_date <= p_as_of
    AND t.bs_section = 'CAPEX_EXPENSED'
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'REVIEW_BUCKET', 'Losses / adjustments bucket needs review',
         'Mixed-purpose category affecting the accumulated result',
         sum(abs(t.amount)), count(*)
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id AND t.transaction_date <= p_as_of
    AND t.category_top = 'Losses, Adjustments & Exceptions'
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'critical', 'NO_CAPITAL_ACCOUNT', 'No capital or equity ledger exists',
         'Equity is derived from ledger flows only; capital introduced, drawings and loans are not recorded anywhere in the system',
         NULL::numeric, 0::bigint;

  RETURN QUERY
  SELECT 'critical', 'INVENTORY_NOT_ATTRIBUTED', 'Crypto inventory cannot be split by company',
         'Wallet holdings are pooled unless mapped to a company in the balance-sheet wallet mapping',
         NULL::numeric, (SELECT count(*) FROM public.wallet_asset_balances WHERE balance <> 0);
END;
$function$;