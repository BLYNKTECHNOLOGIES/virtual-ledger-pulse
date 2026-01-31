-- =============================================
-- BUY ORDER WORKFLOW IMPLEMENTATION
-- =============================================
-- Add new columns to purchase_orders for buy order workflow

-- Add order_status for multi-step workflow (new → banking_collected → pan_collected → added_to_bank → paid → completed)
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'new';

-- Add timer columns
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS timer_end_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS order_expires_at TIMESTAMP WITH TIME ZONE;

-- Add notes for PAN type storage and other metadata
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add is_safe_fund flag
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS is_safe_fund BOOLEAN DEFAULT false;

-- Add total_paid for partial payment tracking
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0;

-- Add customer_name alias (maps to supplier_name for buy orders)
COMMENT ON COLUMN public.purchase_orders.supplier_name IS 'For buy orders, this is the customer name (seller name)';

-- =============================================
-- PURCHASE ORDER STATUS HISTORY TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.purchase_order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.purchase_order_status_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on purchase_order_status_history"
ON public.purchase_order_status_history FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- PURCHASE ORDER PAYMENTS TABLE (for partial payments)
-- =============================================
CREATE TABLE IF NOT EXISTS public.purchase_order_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  screenshot_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id)
);

-- Enable RLS
ALTER TABLE public.purchase_order_payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on purchase_order_payments"
ON public.purchase_order_payments FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- TRIGGER: Auto-track status changes
-- =============================================
CREATE OR REPLACE FUNCTION public.track_purchase_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Track order_status changes for buy order workflow
  IF OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    INSERT INTO public.purchase_order_status_history (order_id, old_status, new_status, notes)
    VALUES (NEW.id, OLD.order_status, NEW.order_status, NULL);
  END IF;
  
  -- Also track legacy status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.purchase_order_status_history (order_id, old_status, new_status, notes)
    VALUES (NEW.id, OLD.status, NEW.status, 'Legacy status change');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS purchase_order_status_change_trigger ON public.purchase_orders;

CREATE TRIGGER purchase_order_status_change_trigger
AFTER UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.track_purchase_order_status_change();

-- =============================================
-- TRIGGER: Update total_paid when payment recorded
-- =============================================
CREATE OR REPLACE FUNCTION public.update_purchase_order_total_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.purchase_orders
    SET total_paid = COALESCE(total_paid, 0) + NEW.amount_paid
    WHERE id = NEW.order_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.purchase_orders
    SET total_paid = COALESCE(total_paid, 0) - OLD.amount_paid
    WHERE id = OLD.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS purchase_order_payment_trigger ON public.purchase_order_payments;

CREATE TRIGGER purchase_order_payment_trigger
AFTER INSERT OR DELETE ON public.purchase_order_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_purchase_order_total_paid();

-- =============================================
-- INDEX for faster queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_status ON public.purchase_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_timer_end_at ON public.purchase_orders(timer_end_at) WHERE timer_end_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_expires_at ON public.purchase_orders(order_expires_at) WHERE order_expires_at IS NOT NULL;