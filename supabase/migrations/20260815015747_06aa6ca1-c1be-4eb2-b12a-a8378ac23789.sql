-- 1. Reversal-aware inter-company view
CREATE OR REPLACE VIEW public.fin_intercompany_v
WITH (security_invoker = true) AS
 WITH legs AS (
         SELECT x.id AS leg_id,
            x.transaction_type AS leg_type,
            x.amount AS leg_amount,
            x.transaction_date AS leg_date,
            x.description AS leg_description,
            x.bank_account_id AS leg_bank_account_id,
            a.subsidiary_id AS leg_subsidiary_id,
            r.id AS counter_leg_id,
            r.transaction_type AS counter_type,
            r.amount AS counter_amount,
            r.transaction_date AS counter_date,
            r.bank_account_id AS counter_bank_account_id,
            b.subsidiary_id AS counter_subsidiary_id,
            r.related_transaction_id = x.id AS mutual
           FROM bank_transactions x
             JOIN bank_accounts a ON a.id = x.bank_account_id
             JOIN bank_transactions r ON r.id = x.related_transaction_id
             JOIN bank_accounts b ON b.id = r.bank_account_id
          WHERE (x.transaction_type = ANY (ARRAY['TRANSFER_IN'::text, 'TRANSFER_OUT'::text]))
            AND a.subsidiary_id IS DISTINCT FROM b.subsidiary_id
            AND COALESCE(x.is_reversed, false) = false
            AND x.reverses_transaction_id IS NULL
            AND COALESCE(r.is_reversed, false) = false
            AND r.reverses_transaction_id IS NULL
        )
 SELECT leg_id,
    counter_leg_id,
        CASE WHEN COALESCE(mutual, false) THEN 'MUTUAL'::text ELSE 'ONE_WAY'::text END AS pairing,
        CASE WHEN leg_type = 'TRANSFER_OUT'::text THEN leg_subsidiary_id ELSE counter_subsidiary_id END AS from_subsidiary_id,
        CASE WHEN leg_type = 'TRANSFER_OUT'::text THEN counter_subsidiary_id ELSE leg_subsidiary_id END AS to_subsidiary_id,
        CASE WHEN leg_type = 'TRANSFER_OUT'::text THEN leg_bank_account_id ELSE counter_bank_account_id END AS from_bank_account_id,
        CASE WHEN leg_type = 'TRANSFER_OUT'::text THEN counter_bank_account_id ELSE leg_bank_account_id END AS to_bank_account_id,
        CASE WHEN leg_type = 'TRANSFER_OUT'::text THEN leg_amount ELSE counter_amount END AS out_amount,
        CASE WHEN leg_type = 'TRANSFER_OUT'::text THEN counter_amount ELSE leg_amount END AS in_amount,
    abs(leg_amount - counter_amount) > 0.01 AS amount_mismatch,
    LEAST(leg_date, counter_date) AS transfer_date,
    leg_description
   FROM legs l
  WHERE leg_type = 'TRANSFER_OUT'::text OR COALESCE(mutual, false) = false;

-- 2. Disclosure of removed reversed cross-entity legs
CREATE OR REPLACE VIEW public.fin_intercompany_excluded_reversals_v
WITH (security_invoker = true) AS
 WITH legs AS (
         SELECT x.id AS leg_id,
            x.transaction_type AS leg_type,
            x.amount AS leg_amount,
            x.transaction_date AS leg_date,
            a.subsidiary_id AS leg_subsidiary_id,
            b.subsidiary_id AS counter_subsidiary_id,
            r.id AS counter_leg_id,
            r.related_transaction_id = x.id AS mutual,
            CASE
              WHEN x.reverses_transaction_id IS NOT NULL OR r.reverses_transaction_id IS NOT NULL
                THEN 'REVERSAL_ENTRY'
              ELSE 'REVERSED_LEG'
            END AS exclusion_reason
           FROM bank_transactions x
             JOIN bank_accounts a ON a.id = x.bank_account_id
             JOIN bank_transactions r ON r.id = x.related_transaction_id
             JOIN bank_accounts b ON b.id = r.bank_account_id
          WHERE (x.transaction_type = ANY (ARRAY['TRANSFER_IN'::text, 'TRANSFER_OUT'::text]))
            AND a.subsidiary_id IS DISTINCT FROM b.subsidiary_id
            AND (COALESCE(x.is_reversed, false)
                 OR x.reverses_transaction_id IS NOT NULL
                 OR COALESCE(r.is_reversed, false)
                 OR r.reverses_transaction_id IS NOT NULL)
        ),
 kept AS (
   SELECT
     CASE WHEN leg_type = 'TRANSFER_OUT' THEN leg_subsidiary_id ELSE counter_subsidiary_id END AS from_subsidiary_id,
     CASE WHEN leg_type = 'TRANSFER_OUT' THEN counter_subsidiary_id ELSE leg_subsidiary_id END AS to_subsidiary_id,
     leg_amount, leg_date, exclusion_reason
   FROM legs
   WHERE leg_type = 'TRANSFER_OUT' OR COALESCE(mutual, false) = false
 )
 SELECT k.from_subsidiary_id,
        k.to_subsidiary_id,
        fs.firm_name AS from_legal_name,
        ts.firm_name AS to_legal_name,
        k.exclusion_reason,
        count(*) AS excluded_count,
        sum(abs(k.leg_amount)) AS excluded_amount,
        max(k.leg_date) AS last_excluded_date
   FROM kept k
   LEFT JOIN subsidiaries fs ON fs.id = k.from_subsidiary_id
   LEFT JOIN subsidiaries ts ON ts.id = k.to_subsidiary_id
  GROUP BY 1,2,3,4,5;

GRANT SELECT ON public.fin_intercompany_excluded_reversals_v TO authenticated;
GRANT SELECT ON public.fin_intercompany_excluded_reversals_v TO service_role;

-- 3. Regression check + excluded-reversal disclosure in the integrity panel
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

  -- Regression guard: no reversed leg may ever reach the inter-company view
  RETURN QUERY
  SELECT 'critical', 'INTERCOMPANY_REVERSAL_LEAK', 'Reversed transfers counted as inter-company movement',
         'A reversed bank transfer (or a reversal entry) is present in the inter-company figures. This overstates receivables and payables and must be fixed before any statement is issued.',
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

  -- Disclosure: reversed cross-entity legs deliberately removed
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

  RETURN QUERY
  SELECT 'critical', 'INVENTORY_NOT_ATTRIBUTED', 'Crypto inventory cannot be split by company',
         'Wallet holdings are pooled unless mapped to a company in the balance-sheet wallet mapping',
         NULL::numeric, (SELECT count(*) FROM public.wallet_asset_balances WHERE balance <> 0);
END;
$function$;

-- 4. Share capital as its own NOT AVAILABLE line for private limited entities
CREATE OR REPLACE FUNCTION public.fin_entity_balance_sheet(p_subsidiary_id uuid, p_as_of date DEFAULT CURRENT_DATE, p_valuation_basis text DEFAULT 'COST'::text, p_usdt_inr_rate numeric DEFAULT NULL::numeric, p_opening_date date DEFAULT '2026-04-01'::date)
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

  SELECT coalesce(sum(pos.net_position) FILTER (WHERE pos.net_position > 0), 0),
         coalesce(-sum(pos.net_position) FILTER (WHERE pos.net_position < 0), 0)
    INTO v_ic_recv, v_ic_pay
  FROM public.fin_intercompany_position_v pos
  WHERE pos.subsidiary_id = p_subsidiary_id;

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

  SELECT coalesce(sum(op.anchor_balance),0),
         coalesce(sum(op.derived_opening_balance),0)
    INTO v_anchor, v_rolled
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
      'Net funds this company transferred to other group companies, paired leg by leg. Reversed transfers are excluded and disclosed separately.', 25),
    ('ASSETS','inventory','Crypto inventory', v_inv, v_inv_conf, v_inv_note, 30),
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
      'Movements between this company''s own bank accounts; nets to nil when both legs are posted', 280),
    ('EQUITY','transfer_unlinked','Transfers with no matching entry', v_unlinked, 'review',
      'Counterparty leg missing or on an unmapped account - cannot be classified', 290),
    ('EQUITY','total_equity', CASE WHEN upper(coalesce(v_composition,'')) = 'PRIVATE_LIMITED'
        THEN 'Total shareholders'' funds (derived from ledger flows, excluding share capital)'
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