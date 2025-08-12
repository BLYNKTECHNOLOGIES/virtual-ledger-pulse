-- Create function and triggers to auto-create bank EXPENSE transactions for purchase orders

-- 1) Function to upsert bank transaction for a purchase order
CREATE OR REPLACE FUNCTION public.sync_bank_tx_for_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tx_id uuid;
BEGIN
  -- Only act when we have a bank account and a positive amount
  IF COALESCE(NEW.bank_account_id, '00000000-0000-0000-0000-000000000000') IS NOT NULL AND COALESCE(NEW.total_amount, 0) > 0 THEN
    -- Check if a bank transaction already exists for this order (by reference_id or reference_number)
    SELECT id INTO tx_id
    FROM public.bank_transactions
    WHERE (reference_number = NEW.order_number OR reference_number = NEW.id::text)
      AND category = 'Purchase'
      AND bank_account_id = NEW.bank_account_id
    LIMIT 1;

    IF tx_id IS NULL THEN
      -- Insert new expense transaction
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
        NEW.total_amount,
        COALESCE(NEW.order_date, CURRENT_DATE),
        'Purchase',
        'Stock Purchase - ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - Order #' || COALESCE(NEW.order_number, NEW.id::text),
        COALESCE(NEW.order_number, NEW.id::text),
        NEW.supplier_name
      );
    ELSE
      -- Update existing to keep in sync if amount/account/date changed
      UPDATE public.bank_transactions
      SET 
        bank_account_id = NEW.bank_account_id,
        amount = NEW.total_amount,
        transaction_date = COALESCE(NEW.order_date, CURRENT_DATE),
        description = 'Stock Purchase - ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - Order #' || COALESCE(NEW.order_number, NEW.id::text),
        related_account_name = NEW.supplier_name,
        updated_at = now()
      WHERE id = tx_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Triggers on purchase_orders to call the function on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_sync_bank_tx_po_ins ON public.purchase_orders;
CREATE TRIGGER trg_sync_bank_tx_po_ins
AFTER INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_bank_tx_for_purchase_order();

DROP TRIGGER IF EXISTS trg_sync_bank_tx_po_upd ON public.purchase_orders;
CREATE TRIGGER trg_sync_bank_tx_po_upd
AFTER UPDATE OF bank_account_id, total_amount, order_date, supplier_name, order_number ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_bank_tx_for_purchase_order();
