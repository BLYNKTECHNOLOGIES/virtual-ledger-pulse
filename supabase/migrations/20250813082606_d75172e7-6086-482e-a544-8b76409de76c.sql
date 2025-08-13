-- Ensure bank balance stays in sync with transactions and POs; backfill and recalc balances

-- 1) Attach trigger to update bank balance on any bank_transactions change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bank_tx_update_balance'
  ) THEN
    CREATE TRIGGER trg_bank_tx_update_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_bank_account_balance();
  END IF;
END
$$;

-- 2) Validate negatives on bank_transactions (prevents overdraft on EXPENSE/TRANSFER_OUT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_negative_values_bank_tx'
  ) THEN
    CREATE TRIGGER trg_validate_negative_values_bank_tx
    BEFORE INSERT OR UPDATE ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_negative_values();
  END IF;
END
$$;

-- 3) Lock bank account balance after any transaction is created (first time)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lock_balance_after_tx'
  ) THEN
    CREATE TRIGGER trg_lock_balance_after_tx
    AFTER INSERT ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();
  END IF;
END
$$;

-- 4) Prevent manual balance edits once locked
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_balance_edit'
  ) THEN
    CREATE TRIGGER trg_validate_balance_edit
    BEFORE UPDATE ON public.bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_balance_edit();
  END IF;
END
$$;

-- 5) Sync bank transaction from purchase_orders on create/update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_bank_tx_on_purchase_orders'
  ) THEN
    CREATE TRIGGER trg_sync_bank_tx_on_purchase_orders
    AFTER INSERT OR UPDATE ON public.purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_bank_tx_for_purchase_order();
  END IF;
END
$$;

-- 6) Maintain product averages and stock from purchase_order_items inserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_product_avg_prices_on_poi'
  ) THEN
    CREATE TRIGGER trg_update_product_avg_prices_on_poi
    AFTER INSERT ON public.purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_product_average_prices();
  END IF;
END
$$;

-- 7) Backfill: create missing bank transactions for existing purchase orders
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT po.*
    FROM public.purchase_orders po
    WHERE po.bank_account_id IS NOT NULL
      AND COALESCE(po.total_amount, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_transactions bt
        WHERE bt.category = 'Purchase'
          AND bt.bank_account_id = po.bank_account_id
          AND bt.reference_number IN (po.order_number, po.id::text)
      )
  LOOP
    BEGIN
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
        rec.bank_account_id,
        'EXPENSE',
        rec.total_amount,
        COALESCE(rec.order_date, CURRENT_DATE),
        'Purchase',
        'Stock Purchase - ' || COALESCE(rec.supplier_name, 'Unknown') || ' - Order #' || COALESCE(rec.order_number, rec.id::text),
        COALESCE(rec.order_number, rec.id::text),
        rec.supplier_name
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped PO % due to: %', rec.id, SQLERRM;
    END;
  END LOOP;
END
$$;

-- 8) Recalculate bank account balances from bank_transactions to ensure correctness now
WITH totals AS (
  SELECT 
    bank_account_id,
    SUM(
      CASE 
        WHEN transaction_type IN ('INCOME','TRANSFER_IN') THEN amount
        WHEN transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -amount
        ELSE 0
      END
    ) AS total
  FROM public.bank_transactions
  GROUP BY bank_account_id
)
UPDATE public.bank_accounts b
SET balance = GREATEST(COALESCE(t.total, 0), 0),
    updated_at = now()
FROM totals t
WHERE b.id = t.bank_account_id;