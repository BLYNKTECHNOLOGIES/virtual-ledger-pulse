
DROP TRIGGER IF EXISTS trg_leave_balance_on_status_change ON hr_leave_requests;
CREATE TRIGGER trg_leave_balance_on_status_change
  BEFORE UPDATE ON hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION fn_leave_balance_on_status_change();
