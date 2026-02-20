
-- Add rate_variance tracking columns to erp_product_conversions
-- This enables auto-reconciliation between booked rate and actual Binance execution

ALTER TABLE erp_product_conversions
  ADD COLUMN IF NOT EXISTS actual_usdt_received numeric,
  ADD COLUMN IF NOT EXISTS rate_variance_usdt numeric GENERATED ALWAYS AS (
    CASE 
      WHEN actual_usdt_received IS NOT NULL 
      THEN actual_usdt_received - net_usdt_change 
      ELSE NULL 
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS actual_execution_rate numeric GENERATED ALWAYS AS (
    CASE 
      WHEN actual_usdt_received IS NOT NULL AND quantity > 0 
      THEN actual_usdt_received / quantity 
      ELSE NULL 
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS rate_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rate_reconciled_by text,
  ADD COLUMN IF NOT EXISTS binance_transfer_id text;

-- Index for finding unreconciled conversions quickly
CREATE INDEX IF NOT EXISTS idx_epc_unreconciled 
  ON erp_product_conversions(created_at DESC) 
  WHERE actual_usdt_received IS NULL AND status = 'APPROVED';

COMMENT ON COLUMN erp_product_conversions.actual_usdt_received IS 
  'Actual USDT received from Binance (from Spot→Funding transfer). Null = not yet reconciled.';
COMMENT ON COLUMN erp_product_conversions.rate_variance_usdt IS 
  'Difference: actual_usdt_received - net_usdt_change (booked). Negative = ERP overbooked.';
COMMENT ON COLUMN erp_product_conversions.actual_execution_rate IS 
  'Actual execution rate derived from Binance transfer amount / quantity sold.';
COMMENT ON COLUMN erp_product_conversions.binance_transfer_id IS 
  'Binance Spot→Funding transfer ID that confirms the actual USDT received.';
