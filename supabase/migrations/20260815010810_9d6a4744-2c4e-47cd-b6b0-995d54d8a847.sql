
INSERT INTO public.fin_account_classification (category_top, bs_section, statement, confidence, notes) VALUES
  ('UNCLASSIFIED', 'UNCLASSIFIED', 'NONE', 'unresolved', 'No category recorded on the transaction')
ON CONFLICT (category_top) DO NOTHING;

-- Recreate the transaction view with transfer-aware classification
DROP VIEW IF EXISTS public.fin_entity_txn_v CASCADE;

CREATE VIEW public.fin_entity_txn_v AS
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
  split_part(coalesce(NULLIF(btrim(t.category),''), 'UNCLASSIFIED'), ' > ', 1) AS category_top,
  CASE
    WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT') THEN
      CASE
        WHEN t.related_transaction_id IS NULL THEN 'TRANSFER_UNLINKED'
        WHEN m2.subsidiary_id IS NULL THEN 'TRANSFER_UNLINKED'
        WHEN m2.subsidiary_id = m.subsidiary_id THEN 'TRANSFER_INTRA'
        ELSE 'TRANSFER_INTER_ENTITY'
      END
    ELSE coalesce(c.bs_section, 'UNCLASSIFIED')
  END AS bs_section,
  CASE WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT') THEN 'BS'
       ELSE coalesce(c.statement, 'NONE') END AS statement,
  CASE
    WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
         AND (t.related_transaction_id IS NULL OR m2.subsidiary_id IS NULL) THEN 'review'
    WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT') THEN 'derived'
    ELSE coalesce(c.confidence, 'unresolved')
  END AS confidence,
  t.description,
  t.reference_number,
  t.related_account_name,
  m2.legal_name AS counterparty_entity,
  t.balance_after,
  t.sequence_no,
  t.is_reversed,
  m.is_adjustment_bucket,
  CASE
    WHEN t.transaction_type IN ('INCOME','TRANSFER_IN')  THEN t.amount
    WHEN t.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -t.amount
    ELSE 0
  END AS signed_amount
FROM public.bank_transactions t
JOIN public.fin_bank_entity_map_v m ON m.bank_account_id = t.bank_account_id
LEFT JOIN public.bank_transactions rt ON rt.id = t.related_transaction_id
LEFT JOIN public.fin_bank_entity_map_v m2 ON m2.bank_account_id = rt.bank_account_id
LEFT JOIN public.fin_account_classification c
       ON c.category_top = split_part(coalesce(NULLIF(btrim(t.category),''), 'UNCLASSIFIED'), ' > ', 1);

GRANT SELECT ON public.fin_entity_txn_v TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_entity_balance_sheet(
  p_subsidiary_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  section text, line_key text, line_label text, amount numeric,
  confidence text, note text, sort_order int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bank numeric := 0; v_lien numeric := 0; v_bank_conf text := 'reconciled';
  v_recv numeric := 0; v_pay numeric := 0;
  v_opening numeric := 0; v_trading numeric := 0; v_income numeric := 0;
  v_opex numeric := 0; v_finance numeric := 0; v_capex numeric := 0;
  v_unclass numeric := 0; v_intra numeric := 0; v_inter numeric := 0; v_unlinked numeric := 0;
  v_retained numeric := 0; v_assets numeric := 0; v_liab numeric := 0; v_equity numeric := 0;
  v_residual numeric := 0;
BEGIN
  SELECT coalesce(sum(bp.ledger_balance),0), coalesce(sum(bp.lien_amount),0),
         CASE WHEN bool_or(bp.confidence = 'review') THEN 'review'
              WHEN bool_and(bp.confidence = 'reconciled') THEN 'reconciled'
              ELSE 'derived' END
    INTO v_bank, v_lien, v_bank_conf
  FROM public.fin_entity_bank_position(p_subsidiary_id, p_as_of) bp;

  SELECT coalesce(sum(coalesce(r.settlement_amount, r.total_amount, 0)), 0) INTO v_recv
  FROM public.fin_entity_receivable_v r
  WHERE r.subsidiary_id = p_subsidiary_id AND r.order_date <= p_as_of;

  SELECT coalesce(sum(p.outstanding_amount), 0) INTO v_pay
  FROM public.fin_entity_payable_v p
  WHERE p.subsidiary_id = p_subsidiary_id AND p.order_date <= p_as_of;

  SELECT
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'OPENING_FUNDS'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'TRADING_FLOW'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'INCOME'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'OPEX'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'FINANCE_COST'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'CAPEX_EXPENSED'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'UNCLASSIFIED'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'TRANSFER_INTRA'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'TRANSFER_INTER_ENTITY'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'TRANSFER_UNLINKED'), 0)
  INTO v_opening, v_trading, v_income, v_opex, v_finance, v_capex, v_unclass, v_intra, v_inter, v_unlinked
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id
    AND t.transaction_date <= p_as_of
    AND t.is_adjustment_bucket = false
    AND t.bs_section <> 'EXCLUDED';

  v_retained := v_trading + v_income + v_opex + v_finance + v_capex + v_unclass;
  v_assets   := v_bank + v_recv;
  v_liab     := v_pay;
  v_equity   := v_opening + v_retained + v_intra + v_inter + v_unlinked;
  v_residual := v_assets - v_liab - v_equity;

  RETURN QUERY VALUES
    ('ASSETS','bank_balance','Balances with banks (ledger position)', v_bank, v_bank_conf,
      'Closing balance after the last posted transaction on or before the reporting date', 10),
    ('ASSETS','lien_restricted','of which lien-marked / restricted', v_lien, 'source',
      'Memorandum line - already included in bank balances above', 11),
    ('ASSETS','receivables','Settlements receivable (gateway / POS)', v_recv, 'source',
      'Pending settlements attributed by settlement bank account', 20),
    ('ASSETS','inventory','Crypto inventory', 0::numeric, 'review',
      'Wallet holdings carry no company attribution - excluded, see unattributed pool', 30),
    ('ASSETS','fixed_assets','Property, plant and equipment', 0::numeric, 'review',
      'No fixed-asset register exists; capital spend was expensed', 40),
    ('ASSETS','total_assets','Total assets (supported)', v_assets, 'derived', null, 99),

    ('LIABILITIES','trade_payables','Trade payables (unpaid purchase balance)', v_pay, 'review',
      'Net payable less amount paid on purchase orders', 110),
    ('LIABILITIES','statutory_dues','Statutory dues payable', 0::numeric, 'unresolved',
      'GST/TDS recorded as bank payments only; no dues ledger exists', 120),
    ('LIABILITIES','borrowings','Borrowings / loans', 0::numeric, 'unresolved',
      'No loan ledger exists; EMI and interest appear only as bank payments', 130),
    ('LIABILITIES','total_liabilities','Total liabilities (supported)', v_liab, 'derived', null, 199),

    ('EQUITY','opening_funds','Funds at ledger inception', v_opening, 'classified',
      'From OPENING_BALANCE entries - not a verified capital account', 210),
    ('EQUITY','retained_trading','Accumulated trading result', v_trading, 'source',
      'Net of purchase, sales and settlement bank flows', 220),
    ('EQUITY','retained_other_income','Other income', v_income, 'classified', null, 230),
    ('EQUITY','retained_opex','Operating expenses', v_opex, 'classified', null, 240),
    ('EQUITY','retained_finance','Finance, banking and statutory costs', v_finance, 'classified', null, 250),
    ('EQUITY','retained_capex','Capital spend charged to expense', v_capex, 'review',
      'Should be capitalised once a fixed-asset register exists', 260),
    ('EQUITY','retained_unclassified','Unclassified movements', v_unclass, 'unresolved',
      'Categories with no reporting treatment mapped', 270),
    ('EQUITY','transfer_intra','Own-account transfers (net)', v_intra, 'derived',
      'Movements between this company''s own bank accounts; nets to nil when both legs are posted', 280),
    ('EQUITY','transfer_inter','Net funds received from / (paid to) group companies', v_inter, 'derived',
      'Inter-company movement - not third-party income or expense', 285),
    ('EQUITY','transfer_unlinked','Transfers with no matching entry', v_unlinked, 'review',
      'Counterparty leg missing or on an unmapped account - cannot be classified', 290),
    ('EQUITY','total_equity','Total equity (derived from ledger flows)', v_equity, 'derived', null, 299),

    ('CHECK','opening_unevidenced','Opening position with no ledger history', v_residual,
      CASE WHEN abs(v_residual) < 0.01 THEN 'reconciled' ELSE 'unresolved' END,
      'Funds present before the first posted transaction, or movements missing from the ledger. Not an adjusting entry - the amount is shown as-is.', 890),
    ('CHECK','balance_check','Assets less (Liabilities + Equity)', v_residual,
      CASE WHEN abs(v_residual) < 0.01 THEN 'reconciled' ELSE 'review' END,
      'A non-zero figure is a real data gap. Causes are listed in the integrity findings.', 900);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_entity_line_detail(
  p_subsidiary_id uuid, p_as_of date, p_line_key text
)
RETURNS TABLE (
  ref_id text, ref_date date, bank_name text, account_name text,
  counterparty text, category text, description text, reference_number text, amount numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id::text, t.transaction_date, t.bank_name, t.account_name,
         coalesce(t.counterparty_entity, t.related_account_name, ''),
         coalesce(t.category, t.bs_section), t.description,
         t.reference_number, t.signed_amount
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id
    AND t.transaction_date <= p_as_of
    AND t.is_adjustment_bucket = false
    AND (
      (p_line_key = 'bank_balance'          AND t.bs_section <> 'EXCLUDED')
      OR (p_line_key = 'opening_funds'          AND t.bs_section = 'OPENING_FUNDS')
      OR (p_line_key = 'retained_trading'       AND t.bs_section = 'TRADING_FLOW')
      OR (p_line_key = 'retained_other_income'  AND t.bs_section = 'INCOME')
      OR (p_line_key = 'retained_opex'          AND t.bs_section = 'OPEX')
      OR (p_line_key = 'retained_finance'       AND t.bs_section = 'FINANCE_COST')
      OR (p_line_key = 'retained_capex'         AND t.bs_section = 'CAPEX_EXPENSED')
      OR (p_line_key = 'retained_unclassified'  AND t.bs_section = 'UNCLASSIFIED')
      OR (p_line_key = 'transfer_intra'         AND t.bs_section = 'TRANSFER_INTRA')
      OR (p_line_key = 'transfer_inter'         AND t.bs_section = 'TRANSFER_INTER_ENTITY')
      OR (p_line_key = 'transfer_unlinked'      AND t.bs_section = 'TRANSFER_UNLINKED')
    )
  UNION ALL
  SELECT r.id::text, r.order_date, '', '', coalesce(r.client_name,''),
         'Pending settlement', r.order_number, r.order_number,
         coalesce(r.settlement_amount, r.total_amount, 0)
  FROM public.fin_entity_receivable_v r
  WHERE p_line_key = 'receivables' AND r.subsidiary_id = p_subsidiary_id AND r.order_date <= p_as_of
  UNION ALL
  SELECT p.id::text, p.order_date, '', '', coalesce(p.supplier_name,''),
         'Unpaid purchase balance', p.order_number, p.order_number, p.outstanding_amount
  FROM public.fin_entity_payable_v p
  WHERE p_line_key = 'trade_payables' AND p.subsidiary_id = p_subsidiary_id AND p.order_date <= p_as_of
  ORDER BY 2 DESC, 9 DESC
  LIMIT 5000;
$$;

CREATE OR REPLACE FUNCTION public.fin_entity_integrity(
  p_subsidiary_id uuid, p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  severity text, code text, title text, detail text,
  impact_amount numeric, affected_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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

  RETURN QUERY
  SELECT 'critical', 'TRANSFER_UNLINKED', 'Transfers with no matching counterparty entry',
         'These movements changed the bank balance but cannot be classified as income, expense or inter-company',
         sum(abs(t.amount)), count(*)
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id AND t.transaction_date <= p_as_of
    AND t.bs_section = 'TRANSFER_UNLINKED'
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'INTER_ENTITY_MOVEMENT', 'Funds moved between group companies',
         'Inter-company balances are not recorded as receivable/payable anywhere in the system',
         sum(abs(t.amount)), count(*)
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id AND t.transaction_date <= p_as_of
    AND t.bs_section = 'TRANSFER_INTER_ENTITY'
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
         'Wallet holdings are pooled across all entities and are excluded from every company balance sheet',
         NULL::numeric, (SELECT count(*) FROM public.wallet_asset_balances WHERE balance <> 0);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_entity_balance_sheet(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.fin_entity_line_detail(uuid, date, text) FROM public;
REVOKE ALL ON FUNCTION public.fin_entity_integrity(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.fin_entity_balance_sheet(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_entity_line_detail(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_entity_integrity(uuid, date) TO authenticated, service_role;
