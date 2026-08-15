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