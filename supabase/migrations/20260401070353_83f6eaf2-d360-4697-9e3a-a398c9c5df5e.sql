
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS effective_usdt_qty numeric,
  ADD COLUMN IF NOT EXISTS effective_usdt_rate numeric;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS effective_usdt_qty numeric,
  ADD COLUMN IF NOT EXISTS effective_usdt_rate numeric;
