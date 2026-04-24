DROP FUNCTION IF EXISTS public.verify_wallet_asset_running_balance();

CREATE OR REPLACE FUNCTION public.verify_wallet_asset_running_balance()
RETURNS TABLE (
  wallet_id uuid,
  wallet_name text,
  asset_code text,
  transaction_id uuid,
  created_at timestamptz,
  transaction_type text,
  amount numeric,
  balance_before numeric,
  balance_after numeric,
  expected_running_total numeric,
  break_type text,
  details text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  prev_wallet uuid := NULL;
  prev_asset text := NULL;
  running_total numeric := 0;
  signed_amt numeric;
  is_credit boolean;
BEGIN
  FOR r IN
    SELECT
      wt.id,
      wt.wallet_id,
      w.wallet_name AS wname,
      COALESCE(NULLIF(wt.asset_code, ''), 'USDT') AS acode,
      wt.created_at,
      wt.transaction_type,
      wt.amount,
      wt.balance_before,
      wt.balance_after,
      wt.sequence_no
    FROM wallet_transactions wt
    JOIN wallets w ON w.id = wt.wallet_id
    WHERE LOWER(TRIM(w.wallet_name)) <> 'balance adjustment wallet'
    ORDER BY wt.wallet_id, COALESCE(NULLIF(wt.asset_code, ''), 'USDT'),
             wt.sequence_no NULLS LAST, wt.created_at, wt.id
  LOOP
    IF prev_wallet IS DISTINCT FROM r.wallet_id OR prev_asset IS DISTINCT FROM r.acode THEN
      running_total := COALESCE(r.balance_before, 0);
      prev_wallet := r.wallet_id;
      prev_asset := r.acode;
    END IF;

    IF r.balance_after IS NOT NULL AND r.balance_before IS NOT NULL
       AND r.balance_after = r.balance_before THEN
      running_total := r.balance_after;
      CONTINUE;
    END IF;

    is_credit := r.transaction_type IN (
      'CREDIT','DEPOSIT','PURCHASE_ORDER','MANUAL_TRANSFER_IN',
      'CONVERSION_IN','REFUND','ADJUSTMENT_CREDIT','TRANSFER_IN',
      'INCOMING_TRANSFER','REVERSAL_CREDIT'
    );
    signed_amt := CASE WHEN is_credit THEN COALESCE(r.amount,0) ELSE -COALESCE(r.amount,0) END;

    IF r.balance_after IS NOT NULL
       AND ABS(r.balance_after - (running_total + signed_amt)) > 0.00000001 THEN
      wallet_id := r.wallet_id;
      wallet_name := r.wname;
      asset_code := r.acode;
      transaction_id := r.id;
      created_at := r.created_at;
      transaction_type := r.transaction_type;
      amount := r.amount;
      balance_before := r.balance_before;
      balance_after := r.balance_after;
      expected_running_total := running_total + signed_amt;
      break_type := 'ARITHMETIC';
      details := format('balance_after %s != running_total %s + signed_amount %s',
                        r.balance_after, running_total, signed_amt);
      RETURN NEXT;
      running_total := r.balance_after;
    ELSE
      running_total := COALESCE(r.balance_after, running_total + signed_amt);
    END IF;
  END LOOP;

  RETURN;
END;
$$;