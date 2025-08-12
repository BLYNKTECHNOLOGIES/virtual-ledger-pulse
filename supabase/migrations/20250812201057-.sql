CREATE OR REPLACE FUNCTION public.sync_bank_tx_for_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tx_id uuid;
BEGIN
  -- Only act when we have a bank account and a positive amount
  IF NEW.bank_account_id IS NOT NULL AND COALESCE(NEW.total_amount, 0) > 0 THEN
    BEGIN
      -- Find existing tx for this order
      SELECT id INTO tx_id
      FROM public.bank_transactions
      WHERE (reference_number = NEW.order_number OR reference_number = NEW.id::text)
        AND category = 'Purchase'
        AND bank_account_id = NEW.bank_account_id
      LIMIT 1;

      IF tx_id IS NULL THEN
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

    EXCEPTION WHEN OTHERS THEN
      -- Do not block purchase order creation if bank tx fails (e.g., insufficient funds)
      RAISE NOTICE 'sync_bank_tx_for_purchase_order skipped due to: %', SQLERRM;
      RETURN NEW;
    END;
  END IF;

  RETURN NEW;
END;
$$;