
-- Manual adjustment: Credit 1.9099 USDT to BINANCE BLYNK to correct accumulated drift
-- Root causes: OFS000434 qty mismatch (+1.0099), OFS000434 fake commission (+1.0), SO-TRM-005191139328 under-debit (-0.10)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id, 
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'CREDIT',
  1.9099,
  'MANUAL_ADJUSTMENT',
  NULL,
  'Drift correction: +1.0099 (OFS000434 qty mismatch 99.009 vs actual 98) +1.0 (OFS000434 fake P2P commission on withdrawal) -0.10 (SO-TRM-005191139328 under-debit from old code)',
  0, 0, 'USDT'
);
