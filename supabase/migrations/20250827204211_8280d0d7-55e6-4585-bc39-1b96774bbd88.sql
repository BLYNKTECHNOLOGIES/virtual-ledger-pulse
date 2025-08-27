-- Function to automatically manage payment method status based on bank account status
CREATE OR REPLACE FUNCTION public.sync_payment_methods_with_bank_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle bank account status changes
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    
    -- If bank account becomes inactive, deactivate all linked payment methods
    IF NEW.status = 'INACTIVE' THEN
      -- Deactivate sales payment methods
      UPDATE public.sales_payment_methods 
      SET is_active = false, updated_at = now()
      WHERE bank_account_id = NEW.id;
      
      -- Deactivate purchase payment methods by bank account name
      UPDATE public.purchase_payment_methods 
      SET is_active = false, updated_at = now()
      WHERE bank_account_name = NEW.account_name;
      
    -- If bank account becomes active, reactivate all linked payment methods
    ELSIF NEW.status = 'ACTIVE' THEN
      -- Reactivate sales payment methods
      UPDATE public.sales_payment_methods 
      SET is_active = true, updated_at = now()
      WHERE bank_account_id = NEW.id;
      
      -- Reactivate purchase payment methods by bank account name
      UPDATE public.purchase_payment_methods 
      SET is_active = true, updated_at = now()
      WHERE bank_account_name = NEW.account_name;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically sync payment methods when bank account status changes
DROP TRIGGER IF EXISTS trigger_sync_payment_methods_with_bank_status ON public.bank_accounts;
CREATE TRIGGER trigger_sync_payment_methods_with_bank_status
  AFTER UPDATE ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_payment_methods_with_bank_status();

-- Also create a function to sync existing data
CREATE OR REPLACE FUNCTION public.sync_existing_payment_methods_with_bank_status()
RETURNS void AS $$
BEGIN
  -- Deactivate sales payment methods linked to inactive banks
  UPDATE public.sales_payment_methods 
  SET is_active = false, updated_at = now()
  WHERE bank_account_id IN (
    SELECT id FROM public.bank_accounts WHERE status = 'INACTIVE'
  );
  
  -- Deactivate purchase payment methods linked to inactive banks
  UPDATE public.purchase_payment_methods 
  SET is_active = false, updated_at = now()
  WHERE bank_account_name IN (
    SELECT account_name FROM public.bank_accounts WHERE status = 'INACTIVE'
  );
  
  -- Reactivate sales payment methods linked to active banks
  UPDATE public.sales_payment_methods 
  SET is_active = true, updated_at = now()
  WHERE bank_account_id IN (
    SELECT id FROM public.bank_accounts WHERE status = 'ACTIVE'
  );
  
  -- Reactivate purchase payment methods linked to active banks
  UPDATE public.purchase_payment_methods 
  SET is_active = true, updated_at = now()
  WHERE bank_account_name IN (
    SELECT account_name FROM public.bank_accounts WHERE status = 'ACTIVE'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the sync function to fix existing data
SELECT public.sync_existing_payment_methods_with_bank_status();