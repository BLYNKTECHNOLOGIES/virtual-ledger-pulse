-- Fix: Replace hstore usage with explicit field comparisons (hstore extension not installed)
CREATE OR REPLACE FUNCTION enforce_payroll_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.is_locked = false THEN
      -- Unlocking: only is_locked may change, block changes to financial fields
      IF NEW.total_gross IS DISTINCT FROM OLD.total_gross
        OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
        OR NEW.total_net IS DISTINCT FROM OLD.total_net
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.pay_period_start IS DISTINCT FROM OLD.pay_period_start
        OR NEW.pay_period_end IS DISTINCT FROM OLD.pay_period_end THEN
        RAISE EXCEPTION 'Cannot modify payroll run fields while unlocking. Only is_locked can change.';
      END IF;
    ELSE
      -- Still locked, block all changes except reviewed_by/reviewed_at/review_notes
      IF NEW.total_gross IS DISTINCT FROM OLD.total_gross
        OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
        OR NEW.total_net IS DISTINCT FROM OLD.total_net
        OR NEW.pay_period_start IS DISTINCT FROM OLD.pay_period_start
        OR NEW.pay_period_end IS DISTINCT FROM OLD.pay_period_end THEN
        RAISE EXCEPTION 'Payroll run % is locked and cannot be modified. Unlock it first.', OLD.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;