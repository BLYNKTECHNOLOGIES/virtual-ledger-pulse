-- =========================================================
-- P1. Shared transfer pairing resolver
-- =========================================================
CREATE OR REPLACE VIEW public.fin_transfer_pair_v AS
WITH legs AS (
  SELECT t.id, t.bank_account_id, t.transaction_type, t.amount, t.transaction_date,
         t.description, t.reference_number, t.related_transaction_id, t.is_reversed,
         t.reverses_transaction_id
  FROM public.bank_transactions t
  WHERE t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
), resolved AS (
  SELECT l.*,
         COALESCE(fwd.id, back.id) AS counter_txn_id,
         COALESCE(fwd.bank_account_id, back.bank_account_id) AS counter_bank_account_id,
         CASE
           WHEN fwd.id IS NOT NULL AND back.id IS NOT NULL THEN 'MUTUAL'
           WHEN fwd.id IS NOT NULL THEN 'ONE_WAY_OUTBOUND'
           WHEN back.id IS NOT NULL THEN 'ONE_WAY_INBOUND'
           ELSE 'ORPHAN'
         END AS pair_kind
  FROM legs l
  LEFT JOIN public.bank_transactions fwd ON fwd.id = l.related_transaction_id
  LEFT JOIN LATERAL (
    SELECT b.id, b.bank_account_id
    FROM public.bank_transactions b
    WHERE b.related_transaction_id = l.id
      AND b.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
      AND b.id <> l.id
    ORDER BY b.created_at NULLS LAST, b.id
    LIMIT 1
  ) back ON l.related_transaction_id IS NULL OR fwd.id IS NULL
)
SELECT r.id AS txn_id,
       r.bank_account_id,
       m.subsidiary_id,
       m.legal_name,
       r.transaction_type,
       r.amount,
       r.transaction_date,
       r.description,
       r.reference_number,
       r.is_reversed,
       r.reverses_transaction_id,
       r.counter_txn_id,
       r.counter_bank_account_id,
       m2.subsidiary_id AS counter_subsidiary_id,
       m2.legal_name    AS counter_legal_name,
       (r.counter_txn_id IS NOT NULL AND r.counter_bank_account_id IS NOT NULL
         AND m2.subsidiary_id IS NULL) AS counter_unmapped,
       r.pair_kind,
       CASE WHEN r.counter_txn_id IS NULL THEN r.id::text
            ELSE LEAST(r.id, r.counter_txn_id)::text || '|' || GREATEST(r.id, r.counter_txn_id)::text
       END AS pair_key
FROM resolved r
JOIN public.fin_bank_entity_map_v m  ON m.bank_account_id = r.bank_account_id
LEFT JOIN public.fin_bank_entity_map_v m2 ON m2.bank_account_id = r.counter_bank_account_id;

GRANT SELECT ON public.fin_transfer_pair_v TO authenticated;
GRANT ALL ON public.fin_transfer_pair_v TO service_role;

-- P1b. Rebuild the unpaired view on the resolver
DROP VIEW IF EXISTS public.fin_transfer_unpaired_v;
CREATE VIEW public.fin_transfer_unpaired_v AS
SELECT p.txn_id AS id,
       p.bank_account_id,
       p.subsidiary_id,
       ba.account_name,
       ba.bank_name,
       p.transaction_type,
       p.amount,
       p.transaction_date,
       p.description,
       p.reference_number,
       'NO_COUNTERPARTY_LINK_IN_EITHER_DIRECTION'::text AS reason
FROM public.fin_transfer_pair_v p
JOIN public.bank_accounts ba ON ba.id = p.bank_account_id
WHERE p.pair_kind = 'ORPHAN';

GRANT SELECT ON public.fin_transfer_unpaired_v TO authenticated;
GRANT ALL ON public.fin_transfer_unpaired_v TO service_role;

-- P1c. Rebuild the transaction classification on the resolver
DROP VIEW IF EXISTS public.fin_entity_txn_v;
CREATE VIEW public.fin_entity_txn_v AS
SELECT t.id,
    t.transaction_date,
    t.bank_account_id,
    m.subsidiary_id,
    m.legal_name,
    m.account_name,
    m.bank_name,
    t.transaction_type,
    t.amount,
    t.category,
    split_part(COALESCE(NULLIF(btrim(t.category), ''), 'UNCLASSIFIED'), ' > ', 1) AS category_top,
    CASE
      WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT') THEN
        CASE
          WHEN tp.counter_txn_id IS NULL THEN 'TRANSFER_UNLINKED'
          WHEN tp.counter_subsidiary_id IS NULL THEN 'TRANSFER_UNMAPPED_COUNTERPARTY'
          WHEN tp.counter_subsidiary_id = m.subsidiary_id THEN 'TRANSFER_INTRA'
          ELSE 'TRANSFER_INTER_ENTITY'
        END
      ELSE COALESCE(c.bs_section, 'UNCLASSIFIED')
    END AS bs_section,
    CASE WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT') THEN 'BS'
         ELSE COALESCE(c.statement, 'NONE') END AS statement,
    CASE
      WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
           AND (tp.counter_txn_id IS NULL OR tp.counter_subsidiary_id IS NULL) THEN 'review'
      WHEN t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT') THEN 'derived'
      ELSE COALESCE(c.confidence, 'unresolved')
    END AS confidence,
    t.description,
    t.reference_number,
    t.related_account_name,
    tp.counter_legal_name AS counterparty_entity,
    t.balance_after,
    t.sequence_no,
    t.is_reversed,
    m.is_adjustment_bucket,
    CASE
      WHEN t.transaction_type IN ('INCOME','TRANSFER_IN') THEN t.amount
      WHEN t.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN - t.amount
      ELSE 0::numeric
    END AS signed_amount,
    tp.pair_kind,
    tp.pair_key
FROM public.bank_transactions t
JOIN public.fin_bank_entity_map_v m ON m.bank_account_id = t.bank_account_id
LEFT JOIN public.fin_transfer_pair_v tp ON tp.txn_id = t.id
LEFT JOIN public.fin_account_classification c
       ON c.category_top = split_part(COALESCE(NULLIF(btrim(t.category), ''), 'UNCLASSIFIED'), ' > ', 1);

GRANT SELECT ON public.fin_entity_txn_v TO authenticated;
GRANT ALL ON public.fin_entity_txn_v TO service_role;

-- =========================================================
-- P2. Crypto inventory derived from orders
-- =========================================================
CREATE OR REPLACE VIEW public.fin_crypto_order_v AS
SELECT 'PURCHASE'::text AS side,
       po.id AS order_id,
       po.order_number,
       po.order_date,
       COALESCE(po.supplier_name,'') AS counterparty,
       COALESCE(po.effective_usdt_qty, po.quantity) AS qty,
       po.total_amount,
       CASE WHEN COALESCE(po.effective_usdt_qty,0) = 0 THEN NULL
            ELSE po.total_amount / po.effective_usdt_qty END AS implied_rate,
       COALESCE(ba.subsidiary_id, sp.subsidiary_id) AS subsidiary_id
FROM public.purchase_orders po
LEFT JOIN public.bank_accounts ba ON ba.id = po.bank_account_id
LEFT JOIN LATERAL (
  SELECT ba2.subsidiary_id
  FROM public.purchase_order_payment_splits s
  JOIN public.bank_accounts ba2 ON ba2.id = s.bank_account_id
  WHERE s.purchase_order_id = po.id AND ba2.subsidiary_id IS NOT NULL
  ORDER BY s.amount DESC LIMIT 1
) sp ON true
UNION ALL
SELECT 'SALE',
       so.id,
       so.order_number,
       so.order_date,
       COALESCE(so.client_name,''),
       COALESCE(so.effective_usdt_qty, so.quantity),
       so.total_amount,
       CASE WHEN COALESCE(so.effective_usdt_qty,0) = 0 THEN NULL
            ELSE so.total_amount / so.effective_usdt_qty END,
       sp.subsidiary_id
FROM public.sales_orders so
LEFT JOIN LATERAL (
  SELECT ba2.subsidiary_id
  FROM public.sales_order_payment_splits s
  JOIN public.bank_accounts ba2 ON ba2.id = s.bank_account_id
  WHERE s.sales_order_id = so.id AND ba2.subsidiary_id IS NOT NULL
  ORDER BY s.amount DESC LIMIT 1
) sp ON true;

GRANT SELECT ON public.fin_crypto_order_v TO authenticated;
GRANT ALL ON public.fin_crypto_order_v TO service_role;

CREATE OR REPLACE VIEW public.fin_crypto_excluded_orders_v AS
SELECT o.side, o.order_id, o.order_number, o.order_date, o.counterparty,
       o.qty AS recorded_quantity, o.total_amount, round(o.implied_rate, 6) AS implied_rate,
       'Implied rate below INR 70 per unit - quantity field is a data error'::text AS reason
FROM public.fin_crypto_order_v o
WHERE o.implied_rate IS NOT NULL AND o.implied_rate < 70;

GRANT SELECT ON public.fin_crypto_excluded_orders_v TO authenticated;
GRANT ALL ON public.fin_crypto_excluded_orders_v TO service_role;

CREATE OR REPLACE FUNCTION public.fin_crypto_inventory(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(purchased_qty numeric, sold_qty numeric, fee_qty numeric,
              derived_qty numeric, wallet_qty numeric, variance_pct numeric,
              wac_rate numeric, excluded_orders bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH clean AS (
    SELECT * FROM public.fin_crypto_order_v o
    WHERE o.order_date <= p_as_of
      AND (o.implied_rate IS NULL OR o.implied_rate >= 70)
  ),
  agg AS (
    SELECT
      COALESCE(sum(qty) FILTER (WHERE side='PURCHASE'),0) AS buy,
      COALESCE(sum(qty) FILTER (WHERE side='SALE'),0)     AS sell,
      CASE WHEN COALESCE(sum(qty) FILTER (WHERE side='PURCHASE' AND implied_rate IS NOT NULL),0) > 0
           THEN sum(total_amount) FILTER (WHERE side='PURCHASE' AND implied_rate IS NOT NULL)
                / sum(qty) FILTER (WHERE side='PURCHASE' AND implied_rate IS NOT NULL)
           ELSE NULL END AS wac
    FROM clean
  ),
  fees AS (
    SELECT COALESCE(sum(fd.fee_amount),0) AS fee_qty
    FROM public.wallet_fee_deductions fd
    WHERE fd.created_at::date <= p_as_of
  ),
  held AS (
    SELECT COALESCE(sum(balance),0) AS wallet_qty
    FROM public.wallet_asset_balances WHERE asset_code = 'USDT'
  ),
  ex AS (SELECT count(*) AS n FROM public.fin_crypto_excluded_orders_v e WHERE e.order_date <= p_as_of)
  SELECT a.buy, a.sell, f.fee_qty,
         a.buy - a.sell - f.fee_qty,
         h.wallet_qty,
         CASE WHEN h.wallet_qty <> 0
              THEN abs((a.buy - a.sell - f.fee_qty) - h.wallet_qty) / abs(h.wallet_qty) * 100
              ELSE NULL END,
         a.wac,
         ex.n
  FROM agg a, fees f, held h, ex;
$$;

GRANT EXECUTE ON FUNCTION public.fin_crypto_inventory(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_crypto_entity_allocation(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(subsidiary_id uuid, legal_name text, purchase_value numeric, share_pct numeric,
              allocated_qty numeric, mapped_qty numeric, basis text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH inv AS (SELECT * FROM public.fin_crypto_inventory(p_as_of)),
  shares AS (
    SELECT o.subsidiary_id, sum(o.total_amount) AS purchase_value
    FROM public.fin_crypto_order_v o
    WHERE o.side = 'PURCHASE' AND o.order_date <= p_as_of
      AND (o.implied_rate IS NULL OR o.implied_rate >= 70)
    GROUP BY o.subsidiary_id
  ),
  tot AS (SELECT COALESCE(sum(purchase_value),0) AS v FROM shares),
  mapped AS (
    SELECT h.subsidiary_id, sum(h.quantity) AS mapped_qty
    FROM public.fin_wallet_entity_holdings_v h
    WHERE h.subsidiary_id IS NOT NULL AND h.asset_code = 'USDT'
    GROUP BY h.subsidiary_id
  )
  SELECT s.subsidiary_id,
         sub.firm_name,
         s.purchase_value,
         CASE WHEN tot.v > 0 THEN s.purchase_value / tot.v * 100 ELSE 0 END,
         CASE WHEN tot.v > 0 THEN inv.derived_qty * s.purchase_value / tot.v ELSE 0 END,
         m.mapped_qty,
         CASE WHEN m.mapped_qty IS NOT NULL THEN 'MAPPED_WALLET' ELSE 'PURCHASE_SHARE_ALLOCATION' END
  FROM shares s
  CROSS JOIN tot CROSS JOIN inv
  LEFT JOIN public.subsidiaries sub ON sub.id = s.subsidiary_id
  LEFT JOIN mapped m ON m.subsidiary_id = s.subsidiary_id;
$$;

GRANT EXECUTE ON FUNCTION public.fin_crypto_entity_allocation(date) TO authenticated, service_role;

-- =========================================================
-- P3/P4. Balance sheet: management mode + named unreconciled line
-- =========================================================
CREATE OR REPLACE FUNCTION public.fin_entity_balance_sheet(
  p_subsidiary_id uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_valuation_basis text DEFAULT 'COST'::text,
  p_usdt_inr_rate numeric DEFAULT NULL::numeric,
  p_opening_date date DEFAULT '2026-04-01'::date,
  p_mode text DEFAULT 'MANAGEMENT'::text)
RETURNS TABLE(section text, line_key text, line_label text, amount numeric, confidence text, note text, sort_order integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bank numeric := 0; v_lien numeric := 0; v_bank_conf text := 'reconciled';
  v_recv numeric := 0; v_pay numeric := 0;
  v_opening numeric := 0; v_trading numeric := 0; v_income numeric := 0;
  v_opex numeric := 0; v_finance numeric := 0; v_capex numeric := 0;
  v_unclass numeric := 0; v_intra numeric := 0; v_inter numeric := 0;
  v_unlinked numeric := 0; v_unmapped_cp numeric := 0;
  v_retained numeric := 0; v_assets numeric := 0; v_liab numeric := 0; v_equity numeric := 0;
  v_residual numeric := 0;
  v_ic_recv numeric := 0; v_ic_pay numeric := 0;
  v_inv numeric := 0; v_inv_conf text := 'review'; v_inv_note text := '';
  v_basis text := upper(coalesce(p_valuation_basis,'COST'));
  v_mode text := upper(coalesce(p_mode,'MANAGEMENT'));
  v_composition text;
  v_anchor numeric := 0; v_rolled numeric := 0; v_unanchored numeric := 0;
  v_eq_prefix text;
  v_inv_qty numeric := 0; v_alloc_basis text := 'PURCHASE_SHARE_ALLOCATION';
  v_share numeric := 0; v_var numeric := NULL; v_wac numeric := NULL;
BEGIN
  SELECT e.firm_composition INTO v_composition
  FROM public.fin_entity_master_v e WHERE e.subsidiary_id = p_subsidiary_id;

  v_eq_prefix := CASE WHEN upper(coalesce(v_composition,'')) = 'PRIVATE_LIMITED'
                      THEN 'Shareholders'' funds' ELSE 'Proprietor''s capital' END;

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

  SELECT coalesce(sum(pos.net_position) FILTER (WHERE pos.net_position > 0), 0),
         coalesce(-sum(pos.net_position) FILTER (WHERE pos.net_position < 0), 0)
    INTO v_ic_recv, v_ic_pay
  FROM public.fin_intercompany_position_v pos
  WHERE pos.subsidiary_id = p_subsidiary_id;

  -- Crypto inventory derived from orders
  SELECT ci.derived_qty, ci.variance_pct, ci.wac_rate
    INTO v_inv_qty, v_var, v_wac
  FROM public.fin_crypto_inventory(p_as_of) ci;

  SELECT COALESCE(a.mapped_qty, a.allocated_qty), a.basis, a.share_pct
    INTO v_inv_qty, v_alloc_basis, v_share
  FROM public.fin_crypto_entity_allocation(p_as_of) a
  WHERE a.subsidiary_id = p_subsidiary_id;

  v_inv_qty := coalesce(v_inv_qty, 0);

  IF v_basis = 'MARKET' AND p_usdt_inr_rate IS NOT NULL THEN
    v_inv := v_inv_qty * p_usdt_inr_rate;
  ELSIF v_basis = 'LCOM' AND p_usdt_inr_rate IS NOT NULL THEN
    v_inv := v_inv_qty * LEAST(coalesce(v_wac,0), p_usdt_inr_rate);
  ELSE
    v_inv := v_inv_qty * coalesce(v_wac, 0);
  END IF;

  v_inv_conf := CASE
    WHEN v_inv_qty = 0 THEN 'review'
    WHEN v_var IS NOT NULL AND v_var > 15 THEN 'review'
    ELSE 'derived' END;

  v_inv_note := CASE WHEN v_alloc_basis = 'MAPPED_WALLET'
      THEN 'Basis: wallets mapped to this company. '
      ELSE 'Basis: allocated on this company''s ' || round(coalesce(v_share,0),2)::text
           || '% share of attributable purchase value - this is not a per-company attribution. ' END
    || 'Quantity ' || round(v_inv_qty,2)::text || ' USDT at INR ' || round(coalesce(v_wac,0),4)::text
    || ' (' || v_basis || '). Derived group inventory vs wallet holdings: '
    || CASE WHEN v_var IS NULL THEN 'not comparable' ELSE round(v_var,1)::text || '%' END
    || '. Orders with an implied rate below INR 70 are excluded as quantity data errors and listed in the findings.';

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
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'TRANSFER_UNLINKED'), 0),
    coalesce(sum(t.signed_amount) FILTER (WHERE t.bs_section = 'TRANSFER_UNMAPPED_COUNTERPARTY'), 0)
  INTO v_opening, v_trading, v_income, v_opex, v_finance, v_capex, v_unclass,
       v_intra, v_inter, v_unlinked, v_unmapped_cp
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id
    AND t.transaction_date <= p_as_of
    AND t.is_adjustment_bucket = false
    AND t.bs_section <> 'EXCLUDED';

  SELECT coalesce(sum(op.anchor_balance),0), coalesce(sum(op.derived_opening_balance),0)
    INTO v_anchor, v_rolled
  FROM public.fin_entity_opening_position(p_subsidiary_id, p_opening_date) op;

  SELECT coalesce(sum(ua.cached_balance),0) INTO v_unanchored
  FROM public.fin_unanchored_accounts_v ua
  WHERE ua.subsidiary_id = p_subsidiary_id;

  v_retained := v_trading + v_income + v_opex + v_finance + v_capex + v_unclass;
  v_assets   := v_bank + v_recv + v_ic_recv + v_inv;
  v_liab     := v_pay + v_ic_pay;
  v_equity   := v_opening + v_retained + v_intra + v_unlinked + v_unmapped_cp + v_inv;
  v_residual := v_assets - v_liab - v_equity;

  RETURN QUERY VALUES
    ('ASSETS','bank_balance','Balances with banks (ledger position)', v_bank, v_bank_conf,
      'Closing balance after the last posted transaction on or before the reporting date', 10),
    ('ASSETS','lien_restricted','of which lien-marked / restricted', v_lien, 'source',
      'Memorandum line - already included in bank balances above', 11),
    ('ASSETS','receivables','Settlements receivable (gateway / POS)', v_recv, 'source',
      'Pending settlements attributed by settlement bank account', 20),
    ('ASSETS','intercompany_receivable','Amounts recoverable from group companies', v_ic_recv, 'derived',
      'Net funds this company transferred to other group companies, paired leg by leg. Reversed transfers are excluded and disclosed separately.', 25),
    ('ASSETS','inventory',
      CASE WHEN v_alloc_basis = 'MAPPED_WALLET'
        THEN 'Crypto inventory (mapped wallets)'
        ELSE 'Crypto inventory (allocated on purchase share - not a per-company attribution)' END,
      v_inv, v_inv_conf, v_inv_note, 30),
    ('ASSETS','fixed_assets','Property, plant and equipment', 0::numeric, 'review',
      'No fixed-asset register exists; capital spend was expensed', 40),
    ('ASSETS','total_assets','Total assets (supported)', v_assets, 'derived', null, 99),

    ('LIABILITIES','trade_payables','Trade payables (unpaid purchase balance)', v_pay, 'review',
      'Net payable less amount paid on purchase orders', 110),
    ('LIABILITIES','intercompany_payable','Amounts payable to group companies', v_ic_pay, 'derived',
      'Net funds this company received from other group companies, paired leg by leg. Reversed transfers are excluded and disclosed separately.', 115),
    ('LIABILITIES','statutory_dues','Statutory dues payable', 0::numeric, 'unresolved',
      'GST/TDS recorded as bank payments only; no dues ledger exists', 120),
    ('LIABILITIES','borrowings','Borrowings / loans', 0::numeric, 'unresolved',
      'No loan ledger exists; EMI and interest appear only as bank payments', 130),
    ('LIABILITIES','total_liabilities','Total liabilities (supported)', v_liab, 'derived', null, 199);

  IF upper(coalesce(v_composition,'')) = 'PRIVATE_LIMITED' THEN
    RETURN QUERY SELECT 'EQUITY'::text, 'share_capital'::text, 'Share capital'::text,
      NULL::numeric, 'review'::text,
      'NOT AVAILABLE - share capital is not captured anywhere in the ERP. It is shown as a required line so its absence is visible, and it is not folded into any other figure.'::text,
      205;
  END IF;

  RETURN QUERY VALUES
    ('EQUITY','opening_funds', v_eq_prefix || ' - funds at ledger inception', v_opening, 'classified',
      'From OPENING_BALANCE entries - not a verified capital account, and not share capital', 210),
    ('EQUITY','retained_trading','Accumulated trading result', v_trading, 'source',
      'Net of purchase, sales and settlement bank flows', 220),
    ('EQUITY','retained_other_income','Other income', v_income, 'classified', null, 230),
    ('EQUITY','retained_opex','Operating expenses', v_opex, 'classified', null, 240),
    ('EQUITY','retained_finance','Finance, banking and statutory costs', v_finance, 'classified', null, 250),
    ('EQUITY','retained_capex','Capital spend charged to expense', v_capex, 'review',
      'Should be capitalised once a fixed-asset register exists', 260),
    ('EQUITY','retained_unclassified','Unclassified movements', v_unclass, 'unresolved',
      'Categories with no reporting treatment mapped', 270),
    ('EQUITY','inventory_carried', 'Crypto inventory carried at ' || v_basis, v_inv, v_inv_conf,
      'Balancing entry for inventory recognised on the asset side', 275),
    ('EQUITY','transfer_intra','Own-account transfers (net)', v_intra, 'derived',
      'Movements between this company''s own bank accounts, paired in both link directions; nets to nil when both legs are posted', 280),
    ('EQUITY','transfer_unmapped_cp','Transfers to accounts outside the entity map', v_unmapped_cp, 'review',
      'Counterparty leg is posted but its bank account is not mapped to any company', 285),
    ('EQUITY','transfer_unlinked','Transfers with no matching entry', v_unlinked, 'review',
      'No counterparty leg exists in either link direction', 290),
    ('EQUITY','total_equity', CASE WHEN upper(coalesce(v_composition,'')) = 'PRIVATE_LIMITED'
        THEN 'Total shareholders'' funds (derived from ledger flows, excluding share capital)'
        ELSE 'Total proprietor''s capital (derived from ledger flows)' END, v_equity, 'derived', null, 299);

  IF v_mode = 'MANAGEMENT' THEN
    RETURN QUERY SELECT 'EQUITY'::text, 'unreconciled_opening'::text,
      'Unreconciled - opening position not evidenced in the ERP'::text,
      v_residual,
      CASE WHEN abs(v_residual) < 0.01 THEN 'reconciled' ELSE 'review' END::text,
      'The ERP holds no data before 04-Feb-2026 and has no capital ledger. This is the unexplained difference, shown in full rather than adjusted.'::text,
      300;
  END IF;

  RETURN QUERY VALUES
    ('CHECK','opening_anchor','Anchored balance at 21-Apr-2026 baseline', v_anchor, 'source',
      'The baseline is an anchor set on 21-Apr-2026. It is not an opening position for the year.', 870),
    ('CHECK','opening_rolled_back','Opening position rolled back from the anchor', v_rolled, 'derived',
      'Anchor balance less net movement between the opening date and the anchor date', 875),
    ('CHECK','opening_unanchored','Balances in accounts with no anchor', v_unanchored, 'unresolved',
      'These accounts have no baseline row, so no opening position can be derived for them', 880),
    ('CHECK','opening_unevidenced','Opening position with no ledger history', v_residual,
      CASE WHEN abs(v_residual) < 0.01 THEN 'reconciled' ELSE 'unresolved' END,
      'Funds present before the first posted transaction, or movements missing from the ledger. Not an adjusting entry - the amount is shown as-is.', 890),
    ('CHECK','balance_check','Assets less (Liabilities + Equity)', v_residual,
      CASE WHEN abs(v_residual) < 0.01 THEN 'reconciled' ELSE 'review' END,
      'A non-zero figure is a real data gap. Causes are listed in the integrity findings.', 900);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_entity_balance_sheet(uuid, date, text, numeric, date, text) TO authenticated, service_role;

-- =========================================================
-- P5c/P5d. Integrity findings: correct counts and labels
-- =========================================================
CREATE OR REPLACE FUNCTION public.fin_entity_integrity(p_subsidiary_id uuid, p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(severity text, code text, title text, detail text, impact_amount numeric, affected_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
         'These movements changed the bank balance and have no counterparty leg in either link direction',
         sum(abs(u.amount)), count(*)
  FROM public.fin_transfer_unpaired_v u
  WHERE u.subsidiary_id IS NOT DISTINCT FROM p_subsidiary_id
    AND u.transaction_date <= p_as_of
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'TRANSFER_FLOW_GAP', 'Group transfers out do not equal transfers in',
         'Total TRANSFER_OUT and TRANSFER_IN across the group differ by this amount; shown gross and not netted away',
         abs(sum(CASE WHEN t.transaction_type = 'TRANSFER_OUT' THEN t.amount ELSE -t.amount END)),
         1::bigint
  FROM public.bank_transactions t
  WHERE t.transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
    AND t.transaction_date <= p_as_of
  HAVING abs(sum(CASE WHEN t.transaction_type = 'TRANSFER_OUT' THEN t.amount ELSE -t.amount END)) > 0.01;

  RETURN QUERY
  SELECT 'warning', 'INTERCOMPANY_POSITION', 'Funds moved between group companies',
         string_agg(COALESCE(p.counterparty_legal_name,'Unattributed') || ': ' || round(p.net_position,2)::text, ', '),
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
  SELECT 'critical', 'INTERCOMPANY_REVERSAL_LEAK', 'Reversed transfers counted as inter-company movement',
         'A reversed bank transfer (or a reversal entry) is present in the inter-company figures.',
         sum(abs(x.out_amount)), count(*)
  FROM (
    SELECT ic.out_amount
    FROM public.fin_intercompany_v ic
    JOIN public.bank_transactions bl ON bl.id = ic.leg_id
    LEFT JOIN public.bank_transactions bc ON bc.id = ic.counter_leg_id
    WHERE COALESCE(bl.is_reversed,false) OR bl.reverses_transaction_id IS NOT NULL
       OR COALESCE(bc.is_reversed,false) OR bc.reverses_transaction_id IS NOT NULL
  ) x
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'info', 'INTERCOMPANY_REVERSALS_EXCLUDED', 'Reversed inter-company transfers excluded',
         string_agg(COALESCE(er.from_legal_name,'Unattributed') || ' -> ' || COALESCE(er.to_legal_name,'Unattributed')
                    || ': ' || er.excluded_count::text || ' leg(s) / ' || round(er.excluded_amount,2)::text
                    || ' (' || er.exclusion_reason || ')', '; '),
         sum(er.excluded_amount), sum(er.excluded_count)::bigint
  FROM public.fin_intercompany_excluded_reversals_v er
  WHERE er.from_subsidiary_id = p_subsidiary_id OR er.to_subsidiary_id = p_subsidiary_id
  HAVING count(*) > 0;

  RETURN QUERY
  SELECT 'warning', 'TRANSFER_UNMAPPED_COUNTERPARTY', 'Transfers whose counterparty account is not mapped to a company',
         'The counterparty leg exists but sits on a bank account with no company mapping, so it cannot be classified as intra or inter-company',
         sum(abs(t.amount)), count(*)
  FROM public.fin_entity_txn_v t
  WHERE t.subsidiary_id = p_subsidiary_id AND t.transaction_date <= p_as_of
    AND t.bs_section = 'TRANSFER_UNMAPPED_COUNTERPARTY'
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
         sum(d.gross_amount), sum(d.entry_count)::bigint
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

  -- Crypto inventory basis + excluded quantity-error orders
  RETURN QUERY
  SELECT CASE WHEN ci.variance_pct IS NULL OR ci.variance_pct > 15 THEN 'warning' ELSE 'info' END,
         'INVENTORY_DERIVED_FROM_ORDERS',
         'Crypto inventory is derived from orders, not attributed per company',
         'Group derived inventory ' || round(ci.derived_qty,2)::text || ' USDT vs wallet holdings '
           || round(ci.wallet_qty,2)::text || ' USDT ('
           || CASE WHEN ci.variance_pct IS NULL THEN 'not comparable' ELSE round(ci.variance_pct,1)::text || '% variance' END
           || '). Company share is an allocation on purchase value, not a true attribution. '
           || (SELECT count(DISTINCT w.id) FROM public.wallets w)::text || ' wallets exist; '
           || (SELECT count(*) FROM public.wallets w
               WHERE NOT EXISTS (SELECT 1 FROM public.fin_wallet_entity_map m WHERE m.wallet_id = w.id))::text
           || ' are not mapped to a company.',
         NULL::numeric,
         (SELECT count(*) FROM public.wallets w
          WHERE NOT EXISTS (SELECT 1 FROM public.fin_wallet_entity_map m WHERE m.wallet_id = w.id))::bigint
  FROM public.fin_crypto_inventory(p_as_of) ci;

  RETURN QUERY
  SELECT 'warning', 'INVENTORY_ORDERS_EXCLUDED', 'Orders excluded from inventory as quantity data errors',
         string_agg(e.order_number || ' (' || to_char(e.order_date,'DD-Mon-YYYY') || ', ' || e.counterparty
                    || ', recorded ' || round(e.recorded_quantity,2)::text || ' USDT at rate '
                    || round(e.implied_rate,4)::text || ')', '; ' ORDER BY e.order_date),
         sum(e.total_amount), count(*)
  FROM public.fin_crypto_excluded_orders_v e
  WHERE e.order_date <= p_as_of
  HAVING count(*) > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_entity_integrity(uuid, date) TO authenticated, service_role;

-- =========================================================
-- P3. Record the mode on the generation log
-- =========================================================
ALTER TABLE public.fin_balance_sheet_generation_log
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'MANAGEMENT';