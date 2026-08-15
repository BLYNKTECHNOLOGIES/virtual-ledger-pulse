-- Wallet holdings resolved to an entity through the mapping table
CREATE OR REPLACE VIEW public.fin_wallet_entity_holdings_v AS
SELECT
  m.subsidiary_id,
  wab.wallet_id,
  w.wallet_name,
  wab.asset_code,
  wab.balance AS quantity,
  px.usdt_price,
  wac.cost_inr_per_unit
FROM public.wallet_asset_balances wab
JOIN public.wallets w ON w.id = wab.wallet_id
LEFT JOIN public.fin_wallet_entity_map m ON m.wallet_id = wab.wallet_id
LEFT JOIN LATERAL (
  SELECT p.usdt_price FROM public.price_snapshots p
  WHERE p.asset_code = wab.asset_code
  ORDER BY p.fetched_at DESC LIMIT 1
) px ON true
LEFT JOIN LATERAL (
  SELECT CASE WHEN sum(po.quantity) > 0
              THEN sum(COALESCE(po.net_amount, po.total_amount, 0)) / sum(po.quantity)
              END AS cost_inr_per_unit
  FROM public.purchase_orders po
  WHERE upper(COALESCE(po.product_name,'')) = upper(wab.asset_code)
    AND COALESCE(po.quantity,0) > 0
) wac ON true
WHERE wab.balance <> 0;

ALTER VIEW public.fin_wallet_entity_holdings_v SET (security_invoker = true);
GRANT SELECT ON public.fin_wallet_entity_holdings_v TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fin_entity_balance_sheet(uuid, date);

CREATE FUNCTION public.fin_entity_balance_sheet(
  p_subsidiary_id uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_valuation_basis text DEFAULT 'COST',
  p_usdt_inr_rate numeric DEFAULT NULL,
  p_opening_date date DEFAULT date '2026-04-01'
)
 RETURNS TABLE(section text, line_key text, line_label text, amount numeric, confidence text, note text, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bank numeric := 0; v_lien numeric := 0; v_bank_conf text := 'reconciled';
  v_recv numeric := 0; v_pay numeric := 0;
  v_opening numeric := 0; v_trading numeric := 0; v_income numeric := 0;
  v_opex numeric := 0; v_finance numeric := 0; v_capex numeric := 0;
  v_unclass numeric := 0; v_intra numeric := 0; v_inter numeric := 0; v_unlinked numeric := 0;
  v_retained numeric := 0; v_assets numeric := 0; v_liab numeric := 0; v_equity numeric := 0;
  v_residual numeric := 0;
  v_ic_recv numeric := 0; v_ic_pay numeric := 0;
  v_inv numeric := 0; v_inv_conf text := 'review'; v_inv_note text := '';
  v_basis text := upper(coalesce(p_valuation_basis,'COST'));
  v_composition text;
  v_anchor numeric := 0; v_rolled numeric := 0; v_unanchored numeric := 0;
  v_eq_prefix text;
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

  -- Inter-company positions
  SELECT coalesce(sum(pos.net_position) FILTER (WHERE pos.net_position > 0), 0),
         coalesce(-sum(pos.net_position) FILTER (WHERE pos.net_position < 0), 0)
    INTO v_ic_recv, v_ic_pay
  FROM public.fin_intercompany_position_v pos
  WHERE pos.subsidiary_id = p_subsidiary_id;

  -- Crypto inventory through the wallet mapping
  IF v_basis = 'MARKET' AND p_usdt_inr_rate IS NULL THEN
    v_inv := 0; v_inv_conf := 'unresolved';
    v_inv_note := 'Market valuation requested but no live USDT/INR rate was supplied';
  ELSE
    SELECT coalesce(sum(
      h.quantity * CASE
        WHEN v_basis = 'MARKET' THEN coalesce(h.usdt_price,0) * p_usdt_inr_rate
        WHEN v_basis = 'LCOM' THEN LEAST(coalesce(h.cost_inr_per_unit, 0),
               CASE WHEN p_usdt_inr_rate IS NULL THEN coalesce(h.cost_inr_per_unit,0)
                    ELSE coalesce(h.usdt_price,0) * p_usdt_inr_rate END)
        ELSE coalesce(h.cost_inr_per_unit, 0)
      END), 0)
      INTO v_inv
    FROM public.fin_wallet_entity_holdings_v h
    WHERE h.subsidiary_id = p_subsidiary_id;

    v_inv_conf := CASE WHEN v_inv = 0 THEN 'review' ELSE 'derived' END;
    v_inv_note := 'Valuation basis: ' || v_basis ||
                  '. Only wallets mapped to this company are included; unmapped wallets remain in the unattributed pool.';
  END IF;

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

  -- Opening position: anchor vs rolled back
  SELECT coalesce(sum(op.anchor_balance),0),
         coalesce(sum(op.derived_opening_balance),0),
         coalesce(sum(op.anchor_balance) FILTER (WHERE op.basis = 'UNANCHORED_NO_BASELINE'), 0)
    INTO v_anchor, v_rolled, v_unanchored
  FROM public.fin_entity_opening_position(p_subsidiary_id, p_opening_date) op;

  SELECT coalesce(sum(ua.cached_balance),0) INTO v_unanchored
  FROM public.fin_unanchored_accounts_v ua
  WHERE ua.subsidiary_id = p_subsidiary_id;

  v_retained := v_trading + v_income + v_opex + v_finance + v_capex + v_unclass;
  v_assets   := v_bank + v_recv + v_ic_recv + v_inv;
  v_liab     := v_pay + v_ic_pay;
  v_equity   := v_opening + v_retained + v_intra + v_unlinked + v_inv;
  v_residual := v_assets - v_liab - v_equity;

  RETURN QUERY VALUES
    ('ASSETS','bank_balance','Balances with banks (ledger position)', v_bank, v_bank_conf,
      'Closing balance after the last posted transaction on or before the reporting date', 10),
    ('ASSETS','lien_restricted','of which lien-marked / restricted', v_lien, 'source',
      'Memorandum line - already included in bank balances above', 11),
    ('ASSETS','receivables','Settlements receivable (gateway / POS)', v_recv, 'source',
      'Pending settlements attributed by settlement bank account', 20),
    ('ASSETS','intercompany_receivable','Amounts recoverable from group companies', v_ic_recv, 'derived',
      'Net funds this company transferred to other group companies, paired leg by leg', 25),
    ('ASSETS','inventory','Crypto inventory', v_inv, v_inv_conf, v_inv_note, 30),
    ('ASSETS','fixed_assets','Property, plant and equipment', 0::numeric, 'review',
      'No fixed-asset register exists; capital spend was expensed', 40),
    ('ASSETS','total_assets','Total assets (supported)', v_assets, 'derived', null, 99),

    ('LIABILITIES','trade_payables','Trade payables (unpaid purchase balance)', v_pay, 'review',
      'Net payable less amount paid on purchase orders', 110),
    ('LIABILITIES','intercompany_payable','Amounts payable to group companies', v_ic_pay, 'derived',
      'Net funds this company received from other group companies, paired leg by leg', 115),
    ('LIABILITIES','statutory_dues','Statutory dues payable', 0::numeric, 'unresolved',
      'GST/TDS recorded as bank payments only; no dues ledger exists', 120),
    ('LIABILITIES','borrowings','Borrowings / loans', 0::numeric, 'unresolved',
      'No loan ledger exists; EMI and interest appear only as bank payments', 130),
    ('LIABILITIES','total_liabilities','Total liabilities (supported)', v_liab, 'derived', null, 199),

    ('EQUITY','opening_funds', v_eq_prefix || ' - funds at ledger inception', v_opening, 'classified',
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
    ('EQUITY','inventory_carried', 'Crypto inventory carried at ' || v_basis, v_inv, v_inv_conf,
      'Balancing entry for inventory recognised on the asset side', 275),
    ('EQUITY','transfer_intra','Own-account transfers (net)', v_intra, 'derived',
      'Movements between this company''s own bank accounts; nets to nil when both legs are posted', 280),
    ('EQUITY','transfer_unlinked','Transfers with no matching entry', v_unlinked, 'review',
      'Counterparty leg missing or on an unmapped account - cannot be classified', 290),
    ('EQUITY','total_equity', CASE WHEN upper(coalesce(v_composition,'')) = 'PRIVATE_LIMITED'
        THEN 'Total shareholders'' funds (derived from ledger flows)'
        ELSE 'Total proprietor''s capital (derived from ledger flows)' END, v_equity, 'derived', null, 299),

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

GRANT EXECUTE ON FUNCTION public.fin_entity_balance_sheet(uuid, date, text, numeric, date) TO authenticated, service_role;