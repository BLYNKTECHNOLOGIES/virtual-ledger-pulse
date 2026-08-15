
-- ============================================================
-- PHASE 1: Entity-scoped financial reporting layer (read-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fin_account_classification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_top text NOT NULL UNIQUE,
  bs_section text NOT NULL,           -- OPENING_FUNDS | TRADING_FLOW | OPEX | CAPEX_EXPENSED | INCOME | STATUTORY | FINANCE_COST | INTERNAL_TRANSFER | EXCLUDED
  statement text NOT NULL,            -- PL | BS | NONE
  confidence text NOT NULL DEFAULT 'classified',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fin_account_classification TO authenticated;
GRANT ALL ON public.fin_account_classification TO service_role;
ALTER TABLE public.fin_account_classification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_class_read" ON public.fin_account_classification;
CREATE POLICY "fin_class_read" ON public.fin_account_classification
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fin_class_admin_write" ON public.fin_account_classification;
CREATE POLICY "fin_class_admin_write" ON public.fin_account_classification
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_fin_class_updated_at ON public.fin_account_classification;
CREATE TRIGGER trg_fin_class_updated_at
  BEFORE UPDATE ON public.fin_account_classification
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fin_account_classification (category_top, bs_section, statement, confidence, notes) VALUES
  ('OPENING_BALANCE',                  'OPENING_FUNDS',    'BS',   'classified', 'Funds present at ledger inception; not a verified capital account'),
  ('Purchase',                         'TRADING_FLOW',     'PL',   'source',     'P2P/market purchase settlement through bank'),
  ('Sales',                            'TRADING_FLOW',     'PL',   'source',     'Sales settlement through bank'),
  ('SALES',                            'TRADING_FLOW',     'PL',   'source',     'Legacy uppercase variant'),
  ('Settlement',                       'TRADING_FLOW',     'PL',   'source',     'Gateway / batch settlement inflow'),
  ('MDR / payment gateway fees',       'FINANCE_COST',     'PL',   'source',     null),
  ('Finance, Banking & Compliance',    'FINANCE_COST',     'PL',   'classified', 'Includes GST/TDS which are statutory, not pure finance cost'),
  ('Employee & People Costs',          'OPEX',             'PL',   'classified', null),
  ('HR & People Development',          'OPEX',             'PL',   'classified', null),
  ('Admin & Miscellaneous',            'OPEX',             'PL',   'classified', null),
  ('Legal, Audit & Professional Fees', 'OPEX',             'PL',   'classified', null),
  ('Operations & Day-to-Day Running',  'OPEX',             'PL',   'classified', null),
  ('Technology & Software',            'OPEX',             'PL',   'classified', null),
  ('Losses, Adjustments & Exceptions', 'OPEX',             'PL',   'unresolved', 'Mixed bucket - needs accounting review'),
  ('Other Income',                     'INCOME',           'PL',   'classified', null),
  ('Capital Expenditure (CapEx)',      'CAPEX_EXPENSED',   'PL',   'review',     'Expensed in ledger; no fixed-asset register exists'),
  ('Reversal',                         'INTERNAL_TRANSFER','NONE', 'derived',    null),
  ('ADJUSTMENT',                       'EXCLUDED',         'NONE', 'derived',    'Audit contra bucket - excluded by ERP doctrine'),
  ('Manual Baseline Reset',            'EXCLUDED',         'NONE', 'derived',    'Audit contra bucket - excluded by ERP doctrine')
ON CONFLICT (category_top) DO NOTHING;

-- ------------------------------------------------------------
-- Entity master with data-quality flags
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fin_entity_master_v AS
SELECT
  s.id                AS subsidiary_id,
  s.firm_name         AS legal_name,
  s.firm_composition,
  NULLIF(btrim(s.gst_number), '') AS gst_number,
  NULLIF(btrim(s.pan_number), '') AS pan_number,
  s.registered_address, s.city, s.state, s.pincode,
  s.date_of_incorporation,
  s.status,
  (SELECT count(*) FROM public.bank_accounts b WHERE b.subsidiary_id = s.id) AS bank_account_count,
  (length(coalesce(btrim(s.gst_number),'')) < 15) AS gst_missing_or_invalid,
  (length(coalesce(btrim(s.pan_number),'')) <> 10) AS pan_missing_or_invalid
FROM public.subsidiaries s;

-- ------------------------------------------------------------
-- Bank account -> entity map
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fin_bank_entity_map_v AS
SELECT
  b.id AS bank_account_id,
  b.account_name,
  b.bank_name,
  right(coalesce(b.account_number,''), 4) AS account_last4,
  b.account_type,
  b.status,
  b.account_status,
  b.dormant_at,
  b.balance      AS cached_balance,
  b.lien_amount,
  b.subsidiary_id,
  s.firm_name    AS legal_name,
  (lower(btrim(coalesce(b.account_name,''))) = 'balance adjustment account') AS is_adjustment_bucket
FROM public.bank_accounts b
LEFT JOIN public.subsidiaries s ON s.id = b.subsidiary_id;

-- ------------------------------------------------------------
-- Every bank transaction, entity-tagged and classified
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fin_entity_txn_v AS
SELECT
  t.id,
  t.transaction_date,
  t.bank_account_id,
  m.subsidiary_id,
  m.legal_name,
  m.account_name,
  m.bank_name,
  t.transaction_type,
  t.amount,
  t.category,
  split_part(coalesce(t.category, 'UNCLASSIFIED'), ' > ', 1) AS category_top,
  coalesce(c.bs_section, 'UNCLASSIFIED') AS bs_section,
  coalesce(c.statement, 'NONE')          AS statement,
  coalesce(c.confidence, 'unresolved')   AS confidence,
  t.description,
  t.reference_number,
  t.related_account_name,
  t.balance_after,
  t.sequence_no,
  t.is_reversed,
  m.is_adjustment_bucket,
  CASE
    WHEN t.transaction_type = 'INCOME' THEN t.amount
    WHEN t.transaction_type = 'EXPENSE' THEN -t.amount
    ELSE 0
  END AS signed_amount
FROM public.bank_transactions t
JOIN public.fin_bank_entity_map_v m ON m.bank_account_id = t.bank_account_id
LEFT JOIN public.fin_account_classification c
       ON c.category_top = split_part(coalesce(t.category, 'UNCLASSIFIED'), ' > ', 1);

-- ------------------------------------------------------------
-- Receivables: settlements pending credit, by settlement bank
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fin_entity_receivable_v AS
SELECT
  ps.id,
  ps.order_number,
  ps.client_name,
  ps.order_date,
  ps.expected_settlement_date,
  ps.settlement_amount,
  ps.total_amount,
  ps.mdr_amount,
  ps.bank_account_id,
  m.subsidiary_id,
  m.legal_name
FROM public.pending_settlements ps
LEFT JOIN public.fin_bank_entity_map_v m ON m.bank_account_id = ps.bank_account_id
WHERE ps.status = 'PENDING';

-- ------------------------------------------------------------
-- Payables: purchase orders with an unpaid remainder
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fin_entity_payable_v AS
WITH po AS (
  SELECT
    p.id,
    p.order_number,
    p.supplier_name,
    p.order_date,
    coalesce(p.net_payable_amount, p.total_amount, 0) AS payable_amount,
    coalesce(p.total_paid, 0)                          AS paid_amount,
    coalesce(p.bank_account_id, (
      SELECT s.bank_account_id FROM public.purchase_order_payment_splits s
      WHERE s.purchase_order_id = p.id ORDER BY s.amount DESC NULLS LAST LIMIT 1
    )) AS resolved_bank_account_id
  FROM public.purchase_orders p
)
SELECT
  po.id, po.order_number, po.supplier_name, po.order_date,
  po.payable_amount, po.paid_amount,
  (po.payable_amount - po.paid_amount) AS outstanding_amount,
  po.resolved_bank_account_id AS bank_account_id,
  m.subsidiary_id,
  m.legal_name
FROM po
LEFT JOIN public.fin_bank_entity_map_v m ON m.bank_account_id = po.resolved_bank_account_id
WHERE (po.payable_amount - po.paid_amount) > 0.01;

-- ------------------------------------------------------------
-- Everything that cannot be attributed to an entity
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fin_unattributed_pool_v AS
SELECT 'BANK_ACCOUNT_UNMAPPED'::text AS pool,
       b.id::text AS ref_id,
       b.account_name || ' / ' || b.bank_name AS label,
       b.balance AS amount_inr,
       NULL::numeric AS quantity,
       NULL::text AS asset_code,
       'Bank account has no company assigned'::text AS reason
FROM public.bank_accounts b
WHERE b.subsidiary_id IS NULL
UNION ALL
SELECT 'PURCHASE_NO_BANK', p.id::text, p.order_number,
       coalesce(p.net_payable_amount, p.total_amount, 0), NULL, NULL,
       'Purchase order has no bank account and no payment split'
FROM public.purchase_orders p
WHERE p.bank_account_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.purchase_order_payment_splits s WHERE s.purchase_order_id = p.id)
UNION ALL
SELECT 'SALE_NO_BANK', so.id::text, so.order_number, coalesce(so.total_amount,0), NULL, NULL,
       'Sales order has no payment split and no settlement record'
FROM public.sales_orders so
WHERE NOT EXISTS (SELECT 1 FROM public.sales_order_payment_splits s WHERE s.sales_order_id = so.id)
  AND NOT EXISTS (SELECT 1 FROM public.pending_settlements ps WHERE ps.sales_order_id = so.id)
UNION ALL
SELECT 'CRYPTO_INVENTORY_POOLED', wab.wallet_id::text || ':' || wab.asset_code,
       w.wallet_name || ' · ' || wab.asset_code,
       NULL, wab.balance, wab.asset_code,
       'Wallet holdings carry no company attribution in the schema'
FROM public.wallet_asset_balances wab
JOIN public.wallets w ON w.id = wab.wallet_id
WHERE wab.balance <> 0;

GRANT SELECT ON public.fin_entity_master_v, public.fin_bank_entity_map_v,
  public.fin_entity_txn_v, public.fin_entity_receivable_v,
  public.fin_entity_payable_v, public.fin_unattributed_pool_v TO authenticated;
GRANT SELECT ON public.fin_entity_master_v, public.fin_bank_entity_map_v,
  public.fin_entity_txn_v, public.fin_entity_receivable_v,
  public.fin_entity_payable_v, public.fin_unattributed_pool_v TO service_role;

-- ------------------------------------------------------------
-- As-of bank position per entity (ledger-derived)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_entity_bank_position(
  p_subsidiary_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  bank_account_id uuid,
  account_name text,
  bank_name text,
  account_last4 text,
  account_type text,
  ledger_balance numeric,
  cached_balance numeric,
  drift numeric,
  lien_amount numeric,
  last_txn_date date,
  txn_count bigint,
  confidence text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.bank_account_id,
    m.account_name,
    m.bank_name,
    m.account_last4,
    m.account_type,
    coalesce(last_tx.balance_after, m.cached_balance, 0)                       AS ledger_balance,
    coalesce(m.cached_balance, 0)                                              AS cached_balance,
    CASE WHEN p_as_of >= current_date
         THEN coalesce(m.cached_balance,0) - coalesce(last_tx.balance_after, m.cached_balance, 0)
         ELSE NULL END                                                         AS drift,
    coalesce(m.lien_amount, 0)                                                 AS lien_amount,
    last_tx.transaction_date                                                   AS last_txn_date,
    coalesce(agg.txn_count, 0)                                                 AS txn_count,
    CASE
      WHEN last_tx.balance_after IS NULL THEN 'review'
      WHEN p_as_of >= current_date
           AND abs(coalesce(m.cached_balance,0) - last_tx.balance_after) > 0.01 THEN 'review'
      WHEN p_as_of >= current_date THEN 'reconciled'
      ELSE 'derived'
    END                                                                        AS confidence
  FROM public.fin_bank_entity_map_v m
  LEFT JOIN LATERAL (
    SELECT t.balance_after, t.transaction_date
    FROM public.bank_transactions t
    WHERE t.bank_account_id = m.bank_account_id
      AND t.transaction_date <= p_as_of
    ORDER BY t.transaction_date DESC, t.sequence_no DESC NULLS LAST, t.created_at DESC
    LIMIT 1
  ) last_tx ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS txn_count
    FROM public.bank_transactions t
    WHERE t.bank_account_id = m.bank_account_id AND t.transaction_date <= p_as_of
  ) agg ON true
  WHERE m.subsidiary_id = p_subsidiary_id
    AND m.is_adjustment_bucket = false
  ORDER BY m.account_name;
$$;

-- ------------------------------------------------------------
-- Balance-sheet lines for one entity as of a date
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_entity_balance_sheet(
  p_subsidiary_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  section text,        -- ASSETS | LIABILITIES | EQUITY | CHECK
  line_key text,
  line_label text,
  amount numeric,
  confidence text,
  note text,
  sort_order int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank numeric := 0;
  v_lien numeric := 0;
  v_bank_conf text := 'reconciled';
  v_recv numeric := 0;
  v_pay numeric := 0;
  v_opening numeric := 0;
  v_trading numeric := 0;
  v_income numeric := 0;
  v_opex numeric := 0;
  v_finance numeric := 0;
  v_capex numeric := 0;
  v_unclass numeric := 0;
  v_retained numeric := 0;
  v_assets numeric := 0;
  v_liab numeric := 0;
  v_equity numeric := 0;
BEGIN
  SELECT coalesce(sum(ledger_balance),0), coalesce(sum(lien_amount),0),
         CASE WHEN bool_or(confidence = 'review') THEN 'review'
              WHEN bool_and(confidence = 'reconciled') THEN 'reconciled'
              ELSE 'derived' END
    INTO v_bank, v_lien, v_bank_conf
  FROM public.fin_entity_bank_position(p_subsidiary_id, p_as_of);

  SELECT coalesce(sum(coalesce(settlement_amount, total_amount, 0)), 0) INTO v_recv
  FROM public.fin_entity_receivable_v
  WHERE subsidiary_id = p_subsidiary_id AND order_date <= p_as_of;

  SELECT coalesce(sum(outstanding_amount), 0) INTO v_pay
  FROM public.fin_entity_payable_v
  WHERE subsidiary_id = p_subsidiary_id AND order_date <= p_as_of;

  SELECT
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'OPENING_FUNDS'), 0),
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'TRADING_FLOW'), 0),
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'INCOME'), 0),
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'OPEX'), 0),
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'FINANCE_COST'), 0),
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'CAPEX_EXPENSED'), 0),
    coalesce(sum(signed_amount) FILTER (WHERE bs_section = 'UNCLASSIFIED'), 0)
  INTO v_opening, v_trading, v_income, v_opex, v_finance, v_capex, v_unclass
  FROM public.fin_entity_txn_v
  WHERE subsidiary_id = p_subsidiary_id
    AND transaction_date <= p_as_of
    AND is_adjustment_bucket = false
    AND bs_section NOT IN ('EXCLUDED', 'INTERNAL_TRANSFER');

  v_retained := v_trading + v_income + v_opex + v_finance + v_capex + v_unclass;
  v_assets := v_bank + v_recv;
  v_liab := v_pay;
  v_equity := v_opening + v_retained;

  RETURN QUERY VALUES
    ('ASSETS','bank_balance','Balances with banks (ledger position)', v_bank, v_bank_conf,
      'Closing balance after the last posted transaction on or before the reporting date', 10),
    ('ASSETS','lien_restricted','of which lien-marked / restricted', v_lien, 'source',
      'Memorandum line - already included in bank balances above', 11),
    ('ASSETS','receivables','Settlements receivable (gateway / POS)', v_recv, 'source',
      'Pending settlements attributed by settlement bank account', 20),
    ('ASSETS','inventory','Crypto inventory', 0::numeric, 'review',
      'Wallet holdings carry no company attribution - reported in the unattributed pool only', 30),
    ('ASSETS','fixed_assets','Property, plant and equipment', 0::numeric, 'review',
      'No fixed-asset register exists; capital spend was expensed - see integrity findings', 40),
    ('ASSETS','total_assets','Total assets (supported)', v_assets, 'derived', null, 99),

    ('LIABILITIES','trade_payables','Trade payables (unpaid purchase balance)', v_pay, 'review',
      'Derived as net payable less amount paid on purchase orders', 110),
    ('LIABILITIES','statutory_dues','Statutory dues payable', 0::numeric, 'unresolved',
      'GST/TDS are recorded as bank payments only; no dues ledger exists', 120),
    ('LIABILITIES','borrowings','Borrowings / loans', 0::numeric, 'unresolved',
      'No loan ledger exists; EMI and interest appear only as bank payments', 130),
    ('LIABILITIES','total_liabilities','Total liabilities (supported)', v_liab, 'derived', null, 199),

    ('EQUITY','opening_funds','Funds at ledger inception', v_opening, 'classified',
      'Derived from OPENING_BALANCE entries - not a verified capital account', 210),
    ('EQUITY','retained_trading','Accumulated trading result', v_trading, 'source',
      'Net of purchase, sales and settlement bank flows', 220),
    ('EQUITY','retained_other_income','Other income', v_income, 'classified', null, 230),
    ('EQUITY','retained_opex','Operating expenses', v_opex, 'classified', null, 240),
    ('EQUITY','retained_finance','Finance, banking and statutory costs', v_finance, 'classified', null, 250),
    ('EQUITY','retained_capex','Capital spend charged to expense', v_capex, 'review',
      'Should be capitalised once a fixed-asset register exists', 260),
    ('EQUITY','retained_unclassified','Unclassified movements', v_unclass, 'unresolved',
      'Categories with no reporting treatment mapped', 270),
    ('EQUITY','total_equity','Total equity (derived)', v_equity, 'derived', null, 299),

    ('CHECK','balance_check','Assets less (Liabilities + Equity)', v_assets - v_liab - v_equity,
      CASE WHEN abs(v_assets - v_liab - v_equity) < 0.01 THEN 'reconciled' ELSE 'review' END,
      'A non-zero figure is a real data gap, not an adjustment. Causes are listed in the integrity findings.', 900);
END;
$$;

-- ------------------------------------------------------------
-- Drill-down: transactions behind a balance-sheet line
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_entity_line_detail(
  p_subsidiary_id uuid,
  p_as_of date,
  p_line_key text
)
RETURNS TABLE (
  ref_id text,
  ref_date date,
  bank_name text,
  account_name text,
  counterparty text,
  category text,
  description text,
  reference_number text,
  amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id::text, t.transaction_date, t.bank_name, t.account_name,
         coalesce(t.related_account_name,'') , t.category, t.description,
         t.reference_number, t.signed_amount
  FROM public.fin_entity_txn_v t
  WHERE p_line_key IN ('opening_funds','retained_trading','retained_other_income',
                       'retained_opex','retained_finance','retained_capex',
                       'retained_unclassified','bank_balance')
    AND t.subsidiary_id = p_subsidiary_id
    AND t.transaction_date <= p_as_of
    AND t.is_adjustment_bucket = false
    AND (
      (p_line_key = 'bank_balance' AND t.bs_section NOT IN ('EXCLUDED'))
      OR (p_line_key = 'opening_funds' AND t.bs_section = 'OPENING_FUNDS')
      OR (p_line_key = 'retained_trading' AND t.bs_section = 'TRADING_FLOW')
      OR (p_line_key = 'retained_other_income' AND t.bs_section = 'INCOME')
      OR (p_line_key = 'retained_opex' AND t.bs_section = 'OPEX')
      OR (p_line_key = 'retained_finance' AND t.bs_section = 'FINANCE_COST')
      OR (p_line_key = 'retained_capex' AND t.bs_section = 'CAPEX_EXPENSED')
      OR (p_line_key = 'retained_unclassified' AND t.bs_section = 'UNCLASSIFIED')
    )

  UNION ALL
  SELECT r.id::text, r.order_date, '', '', coalesce(r.client_name,''),
         'Pending settlement', r.order_number, r.order_number,
         coalesce(r.settlement_amount, r.total_amount, 0)
  FROM public.fin_entity_receivable_v r
  WHERE p_line_key = 'receivables'
    AND r.subsidiary_id = p_subsidiary_id AND r.order_date <= p_as_of

  UNION ALL
  SELECT p.id::text, p.order_date, '', '', coalesce(p.supplier_name,''),
         'Unpaid purchase balance', p.order_number, p.order_number, p.outstanding_amount
  FROM public.fin_entity_payable_v p
  WHERE p_line_key = 'trade_payables'
    AND p.subsidiary_id = p_subsidiary_id AND p.order_date <= p_as_of

  ORDER BY 2 DESC, 9 DESC
  LIMIT 5000;
$$;

-- ------------------------------------------------------------
-- Data integrity findings for one entity
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_entity_integrity(
  p_subsidiary_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  severity text,
  code text,
  title text,
  detail text,
  impact_amount numeric,
  affected_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- entity master gaps
  SELECT 'warning', 'ENTITY_MASTER_INCOMPLETE', 'Entity registration details incomplete',
         'GST/PAN missing or invalid on the company master record', NULL::numeric, 1::bigint
  FROM public.fin_entity_master_v e
  WHERE e.subsidiary_id = p_subsidiary_id AND (e.gst_missing_or_invalid OR e.pan_missing_or_invalid);

  RETURN QUERY
  -- ledger vs cached drift
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
         'Wallet holdings are pooled across all entities and are therefore excluded from every company balance sheet',
         NULL::numeric, (SELECT count(*) FROM public.wallet_asset_balances WHERE balance <> 0);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_entity_bank_position(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.fin_entity_balance_sheet(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.fin_entity_line_detail(uuid, date, text) FROM public;
REVOKE ALL ON FUNCTION public.fin_entity_integrity(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.fin_entity_bank_position(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_entity_balance_sheet(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_entity_line_detail(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_entity_integrity(uuid, date) TO authenticated, service_role;
