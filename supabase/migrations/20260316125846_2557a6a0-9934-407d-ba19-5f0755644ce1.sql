-- Fix OFS000424: Insert missing wallet DEBIT for 199.00497512 USDT
INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, balance_before, balance_after, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'DEBIT',
  199.00497512,
  'SALES_ORDER',
  '3b9ce8c2-929a-4416-acf3-0c5b2f4fbd0a',
  'USDT sold via sales order (corrective entry for OFS000424)',
  0, 0, 'USDT'
);

-- Also mark the queue item as PROCESSED since the entry was actually done
UPDATE public.erp_action_queue
SET status = 'PROCESSED',
    action_type = 'SALE',
    erp_reference_id = 'OFS000424'
WHERE id = '415e2b94-2bb1-4c6c-b916-2ac054a05b9c';