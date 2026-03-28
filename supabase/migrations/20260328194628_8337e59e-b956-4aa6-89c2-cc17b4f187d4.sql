
-- =============================================
-- P2 Migration: Bug & Constraint Fixes
-- =============================================

-- BUG-04: Clean dead status values in leave clash trigger
CREATE OR REPLACE FUNCTION public.update_leave_clashes_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clash_count INTEGER;
BEGIN
  IF NEW.status IN ('requested', 'approved') THEN
    v_clash_count := public.compute_leave_clashes(NEW.id);
    NEW.leave_clashes_count := v_clash_count;
  ELSE
    NEW.leave_clashes_count := 0;
  END IF;
  RETURN NEW;
END;
$function$;

-- GAP-01: Status validation triggers

-- 1. hr_payroll_runs
CREATE OR REPLACE FUNCTION public.fn_validate_payroll_run_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'processing', 'generated', 'reviewed', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid payroll run status: %. Allowed: draft, processing, generated, reviewed, completed, cancelled', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_payroll_run_status ON hr_payroll_runs;
CREATE TRIGGER trg_validate_payroll_run_status
  BEFORE INSERT OR UPDATE OF status ON hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION fn_validate_payroll_run_status();

-- 2. hr_payslips
CREATE OR REPLACE FUNCTION public.fn_validate_payslip_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('generated', 'paid', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid payslip status: %. Allowed: generated, paid, cancelled', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_payslip_status ON hr_payslips;
CREATE TRIGGER trg_validate_payslip_status
  BEFORE INSERT OR UPDATE OF status ON hr_payslips
  FOR EACH ROW EXECUTE FUNCTION fn_validate_payslip_status();

-- 3. hr_loans
CREATE OR REPLACE FUNCTION public.fn_validate_loan_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'active', 'closed') THEN
    RAISE EXCEPTION 'Invalid loan status: %. Allowed: pending, approved, rejected, active, closed', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_loan_status ON hr_loans;
CREATE TRIGGER trg_validate_loan_status
  BEFORE INSERT OR UPDATE OF status ON hr_loans
  FOR EACH ROW EXECUTE FUNCTION fn_validate_loan_status();

-- 4. hr_attendance
CREATE OR REPLACE FUNCTION public.fn_validate_attendance_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.attendance_status NOT IN ('present', 'absent', 'half_day', 'late', 'on_leave') THEN
    RAISE EXCEPTION 'Invalid attendance status: %. Allowed: present, absent, half_day, late, on_leave', NEW.attendance_status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_attendance_status ON hr_attendance;
CREATE TRIGGER trg_validate_attendance_status
  BEFORE INSERT OR UPDATE OF attendance_status ON hr_attendance
  FOR EACH ROW EXECUTE FUNCTION fn_validate_attendance_status();

-- 5. hr_objectives
CREATE OR REPLACE FUNCTION public.fn_validate_objective_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'Invalid objective status: %. Allowed: draft, in_progress, completed', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_objective_status ON hr_objectives;
CREATE TRIGGER trg_validate_objective_status
  BEFORE INSERT OR UPDATE OF status ON hr_objectives
  FOR EACH ROW EXECUTE FUNCTION fn_validate_objective_status();

-- 6. hr_helpdesk_tickets
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid ticket status: %. Allowed: open, in_progress, resolved, closed', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_ticket_status ON hr_helpdesk_tickets;
CREATE TRIGGER trg_validate_ticket_status
  BEFORE INSERT OR UPDATE OF status ON hr_helpdesk_tickets
  FOR EACH ROW EXECUTE FUNCTION fn_validate_ticket_status();

-- 7. hr_assets
CREATE OR REPLACE FUNCTION public.fn_validate_asset_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('available', 'assigned', 'maintenance', 'retired') THEN
    RAISE EXCEPTION 'Invalid asset status: %. Allowed: available, assigned, maintenance, retired', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_asset_status ON hr_assets;
CREATE TRIGGER trg_validate_asset_status
  BEFORE INSERT OR UPDATE OF status ON hr_assets
  FOR EACH ROW EXECUTE FUNCTION fn_validate_asset_status();

-- 8. hr_offer_letters
CREATE OR REPLACE FUNCTION public.fn_validate_offer_letter_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'sent', 'accepted', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Invalid offer letter status: %. Allowed: draft, sent, accepted, rejected, expired', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_offer_letter_status ON hr_offer_letters;
CREATE TRIGGER trg_validate_offer_letter_status
  BEFORE INSERT OR UPDATE OF status ON hr_offer_letters
  FOR EACH ROW EXECUTE FUNCTION fn_validate_offer_letter_status();

-- GAP-06: Punch dedup unique constraint
ALTER TABLE hr_attendance_punches
  ADD CONSTRAINT uq_punch_emp_time UNIQUE (employee_id, punch_time);

-- LEAVE-05: Half-day total_days enforcement
CREATE OR REPLACE FUNCTION public.fn_enforce_half_day_total()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_half_day = true THEN
    NEW.total_days := 0.5;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_half_day_total ON hr_leave_requests;
CREATE TRIGGER trg_enforce_half_day_total
  BEFORE INSERT OR UPDATE ON hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_half_day_total();

-- PAYROLL-04: Duplicate payroll run prevention
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_run_period
  ON hr_payroll_runs (pay_period_start, pay_period_end)
  WHERE status != 'cancelled';
