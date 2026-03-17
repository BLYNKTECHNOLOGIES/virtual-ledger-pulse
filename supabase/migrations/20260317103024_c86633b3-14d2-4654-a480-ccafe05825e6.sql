
-- Corrective DEBIT to fix accumulated under-debits from terminal sales
-- where SALES_ORDER debit was (qty - commission) instead of qty.
-- Total under-debit since last adjustment: 4.69 USDT across 7 orders
-- Orders: SO-TRM-684430921728 (0.36), SO-TRM-280049651712 (0.51), 
-- SO-TRM-375115010048 (0.84), SO-TRM-970514014208 (0.41),
-- SO-TRM-471073148928 (1.03), SO-TRM-567777157120 (1.02), SO-TRM-169629614080 (0.52)

INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'DEBIT',
  4.69,
  'MANUAL_ADJUSTMENT',
  gen_random_uuid(),
  'Corrective debit: fix accumulated under-debits from 7 terminal sales where SALES_ORDER debit = qty-commission instead of qty (root cause: old cached code). Orders: 684430921728, 280049651712, 375115010048, 970514014208, 471073148928, 567777157120, 169629614080',
  0,
  0,
  'USDT'
);
