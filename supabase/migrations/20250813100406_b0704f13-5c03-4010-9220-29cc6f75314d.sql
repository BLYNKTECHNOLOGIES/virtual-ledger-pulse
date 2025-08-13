-- Create trigger to automatically update bank account balances when bank transactions are inserted/updated/deleted

CREATE OR REPLACE FUNCTION public.update_bank_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount,
          updated_at = now()
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount,
          updated_at = now()
      WHERE id = OLD.bank_account_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- First reverse the old transaction
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount
      WHERE id = OLD.bank_account_id;
    END IF;

    -- Then apply the new transaction
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_update_bank_account_balance ON public.bank_transactions;
CREATE TRIGGER trg_update_bank_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_bank_account_balance();

-- Ensure purchase orders also create bank transactions when they have bank_account_id
-- This already exists from previous migration, but ensure it's working properly
CREATE OR REPLACE FUNCTION public.sync_bank_tx_for_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  tx_id uuid;
  payment_amount numeric;
BEGIN
  -- Use net_payable_amount if available, otherwise total_amount
  payment_amount := COALESCE(NEW.net_payable_amount, NEW.total_amount);
  
  -- Only act when we have a bank account and a positive amount
  IF NEW.bank_account_id IS NOT NULL AND payment_amount > 0 THEN
    BEGIN
      -- Find existing tx for this order
      SELECT id INTO tx_id
      FROM public.bank_transactions
      WHERE reference_number = NEW.order_number
        AND category = 'Purchase'
        AND bank_account_id = NEW.bank_account_id
      LIMIT 1;

      IF tx_id IS NULL THEN
        -- Create new bank transaction
        INSERT INTO public.bank_transactions (
          bank_account_id,
          transaction_type,
          amount,
          transaction_date,
          category,
          description,
          reference_number,
          related_account_name
        ) VALUES (
          NEW.bank_account_id,
          'EXPENSE',
          payment_amount,
          COALESCE(NEW.order_date, CURRENT_DATE),
          'Purchase',
          'Stock Purchase - ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - Order #' || COALESCE(NEW.order_number, NEW.id::text),
          COALESCE(NEW.order_number, NEW.id::text),
          NEW.supplier_name
        );
      ELSE
        -- Update existing transaction
        UPDATE public.bank_transactions
        SET 
          bank_account_id = NEW.bank_account_id,
          amount = payment_amount,
          transaction_date = COALESCE(NEW.order_date, CURRENT_DATE),
          description = 'Stock Purchase - ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - Order #' || COALESCE(NEW.order_number, NEW.id::text),
          related_account_name = NEW.supplier_name,
          updated_at = now()
        WHERE id = tx_id;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't block purchase order creation
      RAISE NOTICE 'Bank transaction sync failed: %', SQLERRM;
      RETURN NEW;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the purchase order trigger exists
DROP TRIGGER IF EXISTS trg_sync_bank_tx_for_purchase_order ON public.purchase_orders;
CREATE TRIGGER trg_sync_bank_tx_for_purchase_order
AFTER INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_bank_tx_for_purchase_order();