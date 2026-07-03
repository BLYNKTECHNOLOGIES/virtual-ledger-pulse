-- Re-enable DB-level PAN format guard (validate_pan_format() still exists).
DROP TRIGGER IF EXISTS trg_validate_pan_tds_records ON tds_records;
CREATE TRIGGER trg_validate_pan_tds_records
  BEFORE INSERT OR UPDATE ON tds_records
  FOR EACH ROW EXECUTE FUNCTION validate_pan_format();

DROP TRIGGER IF EXISTS trg_validate_pan_purchase_orders ON purchase_orders;
CREATE TRIGGER trg_validate_pan_purchase_orders
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION validate_pan_format();