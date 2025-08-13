-- 1) Create trigger on purchase_orders to sync bank transaction on create/update
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

-- 2) Backfill: create missing bank transactions for existing purchase orders
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

-- 3) Recalculate bank account balances from bank_transactions to ensure correctness
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