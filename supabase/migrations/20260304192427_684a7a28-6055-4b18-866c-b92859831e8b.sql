
-- Corrective credit to fix accumulated double-debit of Binance commission on sales orders
-- The SALES_ORDER_FEE debits were double-counting commission already included in gross SALES_ORDER debit
-- Current net variance: 1.2986 USDT (Binance has more than ERP)
INSERT INTO public.wallet_transactions (
  wallet_id,
  transaction_type,
  amount,
  reference_type,
  description,
  balance_before,
  balance_after,
  asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'CREDIT',
  1.2986,
  'ADJUSTMENT',
  'Correction: reverse accumulated double-debit of Binance commissions on sales orders (SALES_ORDER_FEE bug fix)',
  0,
  0,
  'USDT'
);
