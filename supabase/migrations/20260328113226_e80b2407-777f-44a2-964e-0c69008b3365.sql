-- Fix corrupted TRX conversion COGS data
-- Since TRX had no proper cost pool (inventory came from transfers, not BUY conversions),
-- use execution_rate as cost basis: cost_out = qty * exec_rate, pnl ≈ 0

-- Fix 5 corrupted erp_product_conversions records
-- For each: recalculate cost_out = quantity * execution_rate_usdt
--           recalculate realized_pnl = (gross_usd_value - fee_amount) - cost_out

-- 1. CONV-20260225-008 (id: a3620f2b)
UPDATE erp_product_conversions SET
  cost_out_usdt = quantity * execution_rate_usdt,
  realized_pnl_usdt = (gross_usd_value - COALESCE(fee_amount, 0)) - (quantity * execution_rate_usdt)
WHERE id = 'a3620f2b-ddd1-48c6-b5cb-7cef197c6f59';

-- 2. CONV-20260302-003 (id: 3096f5ca)
UPDATE erp_product_conversions SET
  cost_out_usdt = quantity * execution_rate_usdt,
  realized_pnl_usdt = (gross_usd_value - COALESCE(fee_amount, 0)) - (quantity * execution_rate_usdt)
WHERE id = '3096f5ca-472b-475a-af87-cd8a7a7c737c';

-- 3. CONV-20260306-003 (id: 7f54fdbf)
UPDATE erp_product_conversions SET
  cost_out_usdt = quantity * execution_rate_usdt,
  realized_pnl_usdt = (gross_usd_value - COALESCE(fee_amount, 0)) - (quantity * execution_rate_usdt)
WHERE id = '7f54fdbf-391c-43f3-8309-f3d776663a07';

-- 4. CONV-20260304-006 (id: 8b49c406)
UPDATE erp_product_conversions SET
  cost_out_usdt = quantity * execution_rate_usdt,
  realized_pnl_usdt = (gross_usd_value - COALESCE(fee_amount, 0)) - (quantity * execution_rate_usdt)
WHERE id = '8b49c406-a546-45ad-9b80-8221e79953bc';

-- 5. CONV-20260306-001 (id: 38064fad)
UPDATE erp_product_conversions SET
  cost_out_usdt = quantity * execution_rate_usdt,
  realized_pnl_usdt = (gross_usd_value - COALESCE(fee_amount, 0)) - (quantity * execution_rate_usdt)
WHERE id = '38064fad-9f31-4f6f-b7eb-49db8a4b45ea';

-- Fix journal entries: update COGS and REALIZED_PNL lines
UPDATE conversion_journal_entries cje SET
  usdt_delta = -(c.quantity * c.execution_rate_usdt)
FROM erp_product_conversions c
WHERE cje.conversion_id = c.id
  AND cje.line_type = 'COGS'
  AND c.id IN (
    'a3620f2b-ddd1-48c6-b5cb-7cef197c6f59',
    '3096f5ca-472b-475a-af87-cd8a7a7c737c',
    '7f54fdbf-391c-43f3-8309-f3d776663a07',
    '8b49c406-a546-45ad-9b80-8221e79953bc',
    '38064fad-9f31-4f6f-b7eb-49db8a4b45ea'
  );

UPDATE conversion_journal_entries cje SET
  usdt_delta = (c.gross_usd_value - COALESCE(c.fee_amount, 0)) - (c.quantity * c.execution_rate_usdt)
FROM erp_product_conversions c
WHERE cje.conversion_id = c.id
  AND cje.line_type = 'REALIZED_PNL'
  AND c.id IN (
    'a3620f2b-ddd1-48c6-b5cb-7cef197c6f59',
    '3096f5ca-472b-475a-af87-cd8a7a7c737c',
    '7f54fdbf-391c-43f3-8309-f3d776663a07',
    '8b49c406-a546-45ad-9b80-8221e79953bc',
    '38064fad-9f31-4f6f-b7eb-49db8a4b45ea'
  );

-- Fix realized_pnl_events
UPDATE realized_pnl_events rpe SET
  cost_out_usdt = c.quantity * c.execution_rate_usdt,
  realized_pnl_usdt = (c.gross_usd_value - COALESCE(c.fee_amount, 0)) - (c.quantity * c.execution_rate_usdt),
  avg_cost_at_sale = c.execution_rate_usdt
FROM erp_product_conversions c
WHERE rpe.conversion_id = c.id
  AND c.id IN (
    'a3620f2b-ddd1-48c6-b5cb-7cef197c6f59',
    '3096f5ca-472b-475a-af87-cd8a7a7c737c',
    '7f54fdbf-391c-43f3-8309-f3d776663a07',
    '8b49c406-a546-45ad-9b80-8221e79953bc',
    '38064fad-9f31-4f6f-b7eb-49db8a4b45ea'
  );

-- Reset TRX wallet_asset_positions to clean state
-- qty_on_hand is maintained by the trigger from wallet_transactions, so don't touch it
-- Just reset cost pool to qty * market rate (~$0.28)
UPDATE wallet_asset_positions
SET avg_cost_usdt = 0.2850,
    cost_pool_usdt = qty_on_hand * 0.2850,
    updated_at = now()
WHERE asset_code = 'TRX' AND avg_cost_usdt = 0 AND qty_on_hand > 0;
