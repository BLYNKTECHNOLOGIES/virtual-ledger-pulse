
-- B9: Add unique constraint on order_number for purchase_orders
-- First, deduplicate by appending a suffix to the older duplicate records
-- Keep the latest record for each order_number as-is

-- For existing duplicates, append _DUP_1, _DUP_2 etc to make them unique
DO $$
DECLARE
  rec RECORD;
  dup_counter INT;
BEGIN
  FOR rec IN (
    SELECT order_number FROM purchase_orders
    GROUP BY order_number HAVING COUNT(*) > 1
  ) LOOP
    dup_counter := 1;
    FOR rec IN (
      SELECT id FROM purchase_orders
      WHERE order_number = rec.order_number
      ORDER BY created_at ASC
      -- Skip the last one (keep it as canonical)
      LIMIT (SELECT COUNT(*) - 1 FROM purchase_orders WHERE order_number = rec.order_number)
    ) LOOP
      UPDATE purchase_orders
      SET order_number = purchase_orders.order_number || '_DUP_' || dup_counter
      WHERE id = rec.id;
      dup_counter := dup_counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- Now add the unique constraint
CREATE UNIQUE INDEX purchase_orders_order_number_unique ON purchase_orders (order_number);
