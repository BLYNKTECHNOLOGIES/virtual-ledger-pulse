-- Add resolved_via tracking column to terminal_sales_sync
ALTER TABLE public.terminal_sales_sync
ADD COLUMN IF NOT EXISTS resolved_via TEXT;

-- Add resolved_via tracking column to terminal_purchase_sync
ALTER TABLE public.terminal_purchase_sync
ADD COLUMN IF NOT EXISTS resolved_via TEXT;

-- Add index for analytics queries on resolved_via
CREATE INDEX IF NOT EXISTS idx_tss_resolved_via ON public.terminal_sales_sync (resolved_via);
CREATE INDEX IF NOT EXISTS idx_tps_resolved_via ON public.terminal_purchase_sync (resolved_via);
