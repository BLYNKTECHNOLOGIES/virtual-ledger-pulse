-- Add dual-role tracking columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS is_buyer boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_seller boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS buyer_approval_status text DEFAULT 'NOT_APPLICABLE',
ADD COLUMN IF NOT EXISTS seller_approval_status text DEFAULT 'NOT_APPLICABLE',
ADD COLUMN IF NOT EXISTS buyer_approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS seller_approved_at timestamp with time zone;

-- Create function to check and update client role on sales order insert
CREATE OR REPLACE FUNCTION public.check_client_buyer_role()
RETURNS TRIGGER AS $$
DECLARE
  client_record RECORD;
BEGIN
  -- Find matching client by name or phone
  SELECT * INTO client_record 
  FROM public.clients 
  WHERE name = NEW.client_name OR phone = NEW.client_phone
  LIMIT 1;
  
  IF FOUND THEN
    -- If client is already a seller but not yet a buyer, set pending approval
    IF client_record.is_seller = true AND client_record.is_buyer = false THEN
      UPDATE public.clients 
      SET buyer_approval_status = 'PENDING_APPROVAL'
      WHERE id = client_record.id;
    END IF;
    
    -- Mark as buyer if order is completed
    IF NEW.status = 'COMPLETED' THEN
      UPDATE public.clients 
      SET is_buyer = true,
          buyer_approval_status = CASE 
            WHEN buyer_approval_status = 'PENDING_APPROVAL' THEN buyer_approval_status 
            ELSE 'APPROVED' 
          END
      WHERE id = client_record.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to check and update client role on purchase order insert
CREATE OR REPLACE FUNCTION public.check_client_seller_role()
RETURNS TRIGGER AS $$
DECLARE
  client_record RECORD;
BEGIN
  -- Find matching client by name or phone
  SELECT * INTO client_record 
  FROM public.clients 
  WHERE name = NEW.supplier_name OR phone = NEW.contact_number
  LIMIT 1;
  
  IF FOUND THEN
    -- If client is already a buyer but not yet a seller, set pending approval
    IF client_record.is_buyer = true AND client_record.is_seller = false THEN
      UPDATE public.clients 
      SET seller_approval_status = 'PENDING_APPROVAL'
      WHERE id = client_record.id;
    END IF;
    
    -- Mark as seller if order is completed
    IF NEW.status = 'COMPLETED' THEN
      UPDATE public.clients 
      SET is_seller = true,
          seller_approval_status = CASE 
            WHEN seller_approval_status = 'PENDING_APPROVAL' THEN seller_approval_status 
            ELSE 'APPROVED' 
          END
      WHERE id = client_record.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for sales orders (buyer role)
DROP TRIGGER IF EXISTS check_buyer_role_trigger ON public.sales_orders;
CREATE TRIGGER check_buyer_role_trigger
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.check_client_buyer_role();

-- Create trigger for purchase orders (seller role)
DROP TRIGGER IF EXISTS check_seller_role_trigger ON public.purchase_orders;
CREATE TRIGGER check_seller_role_trigger
AFTER INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.check_client_seller_role();

-- Update existing clients based on their order history
UPDATE public.clients c
SET is_buyer = true, buyer_approval_status = 'APPROVED'
WHERE EXISTS (
  SELECT 1 FROM public.sales_orders so 
  WHERE so.client_name = c.name OR so.client_phone = c.phone
);

UPDATE public.clients c
SET is_seller = true, seller_approval_status = 'APPROVED'
WHERE EXISTS (
  SELECT 1 FROM public.purchase_orders po 
  WHERE po.supplier_name = c.name OR po.contact_number = c.phone
);