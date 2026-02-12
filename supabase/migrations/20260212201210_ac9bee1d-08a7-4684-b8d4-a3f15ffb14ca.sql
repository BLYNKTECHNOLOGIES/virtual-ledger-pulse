
-- Fix 4 terminal sales orders missing commission (fee) deductions
-- These orders had their quantity deducted but NOT their Binance P2P commission

-- Insert SALES_ORDER_FEE wallet transactions for each missing commission
-- The DB trigger will handle balance_before/balance_after

-- Order 1: SO-TRM-70198528 (commission: 1.04 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 1.04, 'SALES_ORDER_FEE',
  '26dcdeb0-e35e-40ed-9f59-14ab4dc7daef',
  'Platform fee for sales order #SO-TRM-70198528 (Binance commission)', 0, 0, 'USDT'
);

-- Order 2: SO-TRM-14332416 (commission: 0.93 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 0.93, 'SALES_ORDER_FEE',
  '991271a0-d040-4171-bc4e-44bf4e36231f',
  'Platform fee for sales order #SO-TRM-14332416 (Binance commission)', 0, 0, 'USDT'
);

-- Order 3: SO-TRM-44762624 (commission: 0.51 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 0.51, 'SALES_ORDER_FEE',
  'ebbb73e3-aaca-4459-a175-dcebbb641f54',
  'Platform fee for sales order #SO-TRM-44762624 (Binance commission)', 0, 0, 'USDT'
);

-- Order 4: SO-TRM-64181248 (commission: 0.49 USDT)
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'DEBIT', 0.49, 'SALES_ORDER_FEE',
  '2e9b6c5a-c2cd-4d5b-9e59-28c3dd71da66',
  'Platform fee for sales order #SO-TRM-64181248 (Binance commission)', 0, 0, 'USDT'
);

-- Insert corresponding wallet_fee_deductions records for audit/reporting in Platform Fees dashboard
-- Using USDT avg buying price ~97.08 for INR valuation
INSERT INTO public.wallet_fee_deductions (
  wallet_id, order_id, order_type, order_number, gross_amount,
  fee_percentage, fee_amount, net_amount, fee_usdt_amount,
  usdt_rate_used, average_buying_price, fee_inr_value_at_buying_price
) VALUES
(
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  '26dcdeb0-e35e-40ed-9f59-14ab4dc7daef',
  'SALES', 'SO-TRM-70198528', 100000,
  0, 1.04, 100000, 1.04,
  0, 97.08, 100.96
),
(
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  '991271a0-d040-4171-bc4e-44bf4e36231f',
  'SALES', 'SO-TRM-14332416', 90000,
  0, 0.93, 90000, 0.93,
  0, 97.08, 90.28
),
(
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'ebbb73e3-aaca-4459-a175-dcebbb641f54',
  'SALES', 'SO-TRM-44762624', 49398.04,
  0, 0.51, 49398.04, 0.51,
  0, 97.08, 49.51
),
(
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  '2e9b6c5a-c2cd-4d5b-9e59-28c3dd71da66',
  'SALES', 'SO-TRM-64181248', 49000,
  0, 0.49, 49000, 0.49,
  0, 97.08, 47.57
);
