
-- =====================================================
-- Phase 2: Auto-populate client_id on sales_orders insert/update
-- AND harden bank balance trigger with SECURITY DEFINER + search_path
-- =====================================================

-- 1. Auto-fill client_id trigger (so frontend doesn't need changes)
CREATE OR REPLACE FUNCTION public.auto_fill_sales_order_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  -- Only try to fill if client_id is not already set
  IF NEW.client_id IS NULL AND NEW.client_name IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name))
    AND is_deleted = false
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
      NEW.client_id := v_client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_fill_client_id
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fill_sales_order_client_id();

-- 2. Harden bank balance trigger with SECURITY DEFINER + search_path
CREATE OR REPLACE FUNCTION public.update_bank_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount, updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount, updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSE
      RAISE WARNING 'Unknown transaction_type: %, skipping balance update', NEW.transaction_type;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount, updated_at = now()
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount, updated_at = now()
      WHERE id = OLD.bank_account_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Reverse old
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts SET balance = balance - OLD.amount WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts SET balance = balance + OLD.amount WHERE id = OLD.bank_account_id;
    END IF;
    -- Apply new
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts SET balance = balance + NEW.amount, updated_at = now() WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts SET balance = balance - NEW.amount, updated_at = now() WHERE id = NEW.bank_account_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;
