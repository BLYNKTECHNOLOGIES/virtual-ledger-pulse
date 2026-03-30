-- Drop the dead buy-order workflow trigger and function from purchase_orders
-- These enforced creator/payer role separation which has been removed

DROP TRIGGER IF EXISTS trg_enforce_purchase_order_status_rules ON public.purchase_orders;
DROP FUNCTION IF EXISTS public.enforce_purchase_order_status_rules();

-- Now drop the dead columns
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS order_status;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS failure_reason;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS timer_end_at;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS order_expires_at;