
-- C4: Prevent zero/negative purchase order amounts
CREATE OR REPLACE FUNCTION public.validate_purchase_order_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_amount IS NOT NULL AND NEW.total_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase order total_amount must be greater than 0, got %', NEW.total_amount;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_po_amount
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_order_amount();

-- C5: Enforce payroll lock immutability
CREATE OR REPLACE FUNCTION public.enforce_payroll_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_locked = true AND NEW.is_locked = true THEN
    -- Allow only unlocking (is_locked true -> false), block all other changes
    RAISE EXCEPTION 'Payroll run % is locked and cannot be modified. Unlock it first.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_payroll_lock
  BEFORE UPDATE ON hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payroll_lock();
