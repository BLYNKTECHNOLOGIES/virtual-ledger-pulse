-- Fix 4 sales orders missing wallet deductions by inserting wallet transactions
-- The DB trigger will handle balance_before/balance_after and update wallet.current_balance

-- Order 1: SO-TRM-70198528 (992.06 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 992.06, 'SALES_ORDER', 
  '26dcdeb0-e35e-40ed-9f59-14ab4dc7daef',
  'USDT sold via sales order', 0, 0, 'USDT'
);

-- Order 2: SO-TRM-14332416 (892.85 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 892.85, 'SALES_ORDER',
  '991271a0-d040-4171-bc4e-44bf4e36231f',
  'USDT sold via sales order', 0, 0, 'USDT'
);

-- Order 3: SO-TRM-44762624 (490.06 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 490.06, 'SALES_ORDER',
  'ebbb73e3-aaca-4459-a175-dcebbb641f54',
  'USDT sold via sales order', 0, 0, 'USDT'
);

-- Order 4: SO-TRM-64181248 (475.72 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 475.72, 'SALES_ORDER',
  '2e9b6c5a-c2cd-4d5b-9e59-28c3dd71da66',
  'USDT sold via sales order', 0, 0, 'USDT'
);
