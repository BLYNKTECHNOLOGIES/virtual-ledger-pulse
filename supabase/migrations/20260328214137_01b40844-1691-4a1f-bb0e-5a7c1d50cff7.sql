-- B31: Add PAN validation trigger on tds_records (not CHECK since we need to allow NULL)
-- Also add validation on purchase_orders.pan_number
CREATE OR REPLACE FUNCTION validate_pan_format()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL AND NEW.pan_number != '' THEN
    IF NEW.pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
      RAISE EXCEPTION 'Invalid PAN format: %. Expected format: AAAAA9999A', NEW.pan_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply to tds_records
DROP TRIGGER IF EXISTS trg_validate_pan_tds_records ON tds_records;
CREATE TRIGGER trg_validate_pan_tds_records
  BEFORE INSERT OR UPDATE ON tds_records
  FOR EACH ROW EXECUTE FUNCTION validate_pan_format();

-- Apply to purchase_orders
DROP TRIGGER IF EXISTS trg_validate_pan_purchase_orders ON purchase_orders;
CREATE TRIGGER trg_validate_pan_purchase_orders
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION validate_pan_format();

-- B32: Drop the dangerous v2 overload that causes double bank transactions
DROP FUNCTION IF EXISTS complete_sales_order_with_banking(text, text, numeric, numeric, numeric, uuid, text, text, uuid, date, text);