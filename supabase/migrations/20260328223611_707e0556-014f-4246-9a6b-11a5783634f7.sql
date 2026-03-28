
-- ============================================================
-- GAP-V4-01: FnF Settlement State Machine
-- Valid transitions: draft → calculated → approved → paid
--                    draft → cancelled, calculated → cancelled
-- ============================================================
CREATE OR REPLACE FUNCTION fn_enforce_fnf_state_machine()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('calculated', 'cancelled')) OR
      (OLD.status = 'calculated' AND NEW.status IN ('approved', 'cancelled')) OR
      (OLD.status = 'approved' AND NEW.status = 'paid')
    ) THEN
      RAISE EXCEPTION 'Invalid FnF status transition: % → %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'approved' AND (NEW.approved_by IS NULL OR NEW.approved_by = '') THEN
      RAISE EXCEPTION 'approved_by is required when approving FnF settlement';
    END IF;

    IF NEW.status = 'paid' AND (NEW.payment_reference IS NULL OR NEW.payment_reference = '') THEN
      RAISE EXCEPTION 'payment_reference is required when marking FnF as paid';
    END IF;

    IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_fnf_state_machine
  BEFORE UPDATE ON hr_fnf_settlements
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_fnf_state_machine();

-- ============================================================
-- GAP-V4-02: Lock attendance edits for completed payroll periods
-- ============================================================
CREATE OR REPLACE FUNCTION fn_lock_attendance_for_completed_payroll()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_locked BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.attendance_date;
  ELSE
    v_date := NEW.attendance_date;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM hr_payroll_runs
    WHERE status = 'completed'
      AND is_locked = true
      AND month = EXTRACT(MONTH FROM v_date)::INT
      AND year = EXTRACT(YEAR FROM v_date)::INT
  ) INTO v_locked;

  IF v_locked THEN
    RAISE EXCEPTION 'Cannot modify attendance for %: payroll for this period is completed and locked',
      to_char(v_date, 'Mon YYYY');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_lock_attendance_for_payroll
  BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance
  FOR EACH ROW
  EXECUTE FUNCTION fn_lock_attendance_for_completed_payroll();

-- ============================================================
-- P2-7: Payslip State Machine (enhance existing validation)
-- Transitions: generated → paid, generated → cancelled
-- ============================================================
CREATE OR REPLACE FUNCTION fn_validate_payslip_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('generated', 'paid', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid payslip status: %. Allowed: generated, paid, cancelled', NEW.status;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'generated' AND NEW.status IN ('paid', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Invalid payslip status transition: % → %. Only generated→paid or generated→cancelled allowed',
        OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- GAP-V4-09: Prevent overlapping shift schedules
-- ============================================================
CREATE OR REPLACE FUNCTION fn_validate_shift_schedule_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_overlap_count INT;
BEGIN
  SELECT COUNT(*) INTO v_overlap_count
  FROM hr_employee_shift_schedule
  WHERE employee_id = NEW.employee_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND effective_from <= COALESCE(NEW.effective_to, '9999-12-31'::date)
    AND COALESCE(effective_to, '9999-12-31'::date) >= NEW.effective_from;

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Shift schedule overlaps with an existing assignment for this employee (effective_from: %)', NEW.effective_from;
  END IF;

  IF NEW.is_current = true THEN
    UPDATE hr_employee_shift_schedule
    SET is_current = false
    WHERE employee_id = NEW.employee_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_current = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_validate_shift_schedule_overlap
  BEFORE INSERT OR UPDATE ON hr_employee_shift_schedule
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_shift_schedule_overlap();
