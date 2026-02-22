
-- Fix seller auto-approval: never auto-approve, only set is_seller and keep PENDING
CREATE OR REPLACE FUNCTION public.check_client_seller_role()
RETURNS TRIGGER AS $$
DECLARE
  client_record RECORD;
BEGIN
  -- Find matching client by name
  SELECT * INTO client_record 
  FROM public.clients 
  WHERE LOWER(name) = LOWER(NEW.supplier_name)
  LIMIT 1;
  
  IF FOUND THEN
    -- Mark as seller if order is completed, but NEVER auto-approve
    IF NEW.status = 'COMPLETED' THEN
      UPDATE public.clients 
      SET is_seller = true,
          seller_approval_status = CASE 
            WHEN seller_approval_status IS NULL OR seller_approval_status = 'NOT_APPLICABLE' THEN 'PENDING'
            ELSE seller_approval_status  -- preserve existing status (PENDING, APPROVED, REJECTED, etc.)
          END
      WHERE id = client_record.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix buyer auto-approval: never auto-approve, only set is_buyer and keep PENDING
CREATE OR REPLACE FUNCTION public.check_client_buyer_role()
RETURNS TRIGGER AS $$
DECLARE
  client_record RECORD;
BEGIN
  -- Find matching client by name
  SELECT * INTO client_record 
  FROM public.clients 
  WHERE LOWER(name) = LOWER(NEW.client_name)
  LIMIT 1;
  
  IF FOUND THEN
    -- Mark as buyer if order is completed, but NEVER auto-approve
    IF NEW.status = 'COMPLETED' THEN
      UPDATE public.clients 
      SET is_buyer = true,
          buyer_approval_status = CASE 
            WHEN buyer_approval_status IS NULL OR buyer_approval_status = 'NOT_APPLICABLE' THEN 'PENDING'
            ELSE buyer_approval_status  -- preserve existing status (PENDING, APPROVED, REJECTED, etc.)
          END
      WHERE id = client_record.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
