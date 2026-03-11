
-- =====================================================
-- CLEANUP: Delete all duplicate small_sales_sync records
-- Keep only ff2ff396 for order 22862766696633114624 (it also has 22864944236492644352)
-- All others are duplicates caused by the dedup bug
-- =====================================================

-- Delete all small_sales_sync records containing 22862766696633114624 
-- except the canonical record ff2ff396
DELETE FROM small_sales_sync
WHERE '22862766696633114624' = ANY(order_numbers)
  AND id != 'ff2ff396-344d-4b5b-9727-8d79ea461606';

-- Also clean up any orphaned small_sales_order_map entries that reference deleted sync records
DELETE FROM small_sales_order_map
WHERE small_sales_sync_id NOT IN (SELECT id FROM small_sales_sync);

-- =====================================================
-- PREVENTION: Create a function + trigger to prevent 
-- duplicate order_numbers across non-rejected sync records
-- for BOTH small_sales_sync and small_buys_sync
-- =====================================================

-- Small Sales: prevent duplicate order numbers
CREATE OR REPLACE FUNCTION prevent_duplicate_small_sales_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  dup_order text;
BEGIN
  -- Only check for non-rejected records
  IF NEW.sync_status = 'rejected' THEN
    RETURN NEW;
  END IF;

  -- Check if any order number in the new record already exists in a non-rejected sync
  SELECT unnest INTO dup_order
  FROM unnest(NEW.order_numbers) 
  WHERE unnest IN (
    SELECT unnest(order_numbers) 
    FROM small_sales_sync 
    WHERE sync_status != 'rejected' 
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  LIMIT 1;

  IF dup_order IS NOT NULL THEN
    RAISE EXCEPTION 'Order % already exists in a non-rejected small_sales_sync record', dup_order;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_small_sales_orders ON small_sales_sync;
CREATE TRIGGER trg_prevent_duplicate_small_sales_orders
  BEFORE INSERT ON small_sales_sync
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_small_sales_orders();

-- Small Buys: prevent duplicate order numbers
CREATE OR REPLACE FUNCTION prevent_duplicate_small_buys_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  dup_order text;
BEGIN
  IF NEW.sync_status = 'rejected' THEN
    RETURN NEW;
  END IF;

  SELECT unnest INTO dup_order
  FROM unnest(NEW.order_numbers) 
  WHERE unnest IN (
    SELECT unnest(order_numbers) 
    FROM small_buys_sync 
    WHERE sync_status != 'rejected' 
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  LIMIT 1;

  IF dup_order IS NOT NULL THEN
    RAISE EXCEPTION 'Order % already exists in a non-rejected small_buys_sync record', dup_order;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_small_buys_orders ON small_buys_sync;
CREATE TRIGGER trg_prevent_duplicate_small_buys_orders
  BEFORE INSERT ON small_buys_sync
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_small_buys_orders();
