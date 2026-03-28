-- GAP-V4-07: Auto-sync loan balance on repayment
CREATE OR REPLACE FUNCTION fn_sync_loan_balance_on_repayment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE hr_loans
  SET outstanding_balance = NEW.balance_after,
      status = CASE WHEN NEW.balance_after <= 0 THEN 'closed' ELSE status END,
      updated_at = now()
  WHERE id = NEW.loan_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_loan_balance
  AFTER INSERT ON hr_loan_repayments
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_loan_balance_on_repayment();

-- GAP-V4-08: Auto-sync deposit balance on transaction
CREATE OR REPLACE FUNCTION fn_sync_deposit_balance_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE hr_employee_deposits
  SET current_balance = NEW.balance_after,
      collected_amount = collected_amount + CASE WHEN NEW.transaction_type = 'collection' THEN NEW.amount ELSE 0 END,
      is_fully_collected = CASE WHEN NEW.balance_after >= total_deposit_amount THEN true ELSE false END,
      updated_at = now()
  WHERE id = NEW.deposit_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_deposit_balance
  AFTER INSERT ON hr_deposit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_deposit_balance_on_transaction();

-- BUG-V4-07: Fix UUID::TEXT cast in auto_track_late_early
CREATE OR REPLACE FUNCTION auto_track_late_early()
RETURNS TRIGGER AS $$
DECLARE
  v_shift_id UUID;
  v_shift RECORD;
  v_check_in TIME;
  v_check_out TIME;
  v_grace INTEGER;
  v_late_mins INTEGER;
  v_early_mins INTEGER;
  v_policy_grace INTEGER;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.hr_employee_work_info
  WHERE employee_id = NEW.employee_id
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT start_time, end_time, grace_period_minutes
  INTO v_shift
  FROM public.hr_shifts
  WHERE id = v_shift_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_shift.grace_period_minutes, 0) > 0 THEN
    v_grace := v_shift.grace_period_minutes;
  ELSE
    SELECT COALESCE(grace_period_minutes, 0) INTO v_policy_grace
    FROM public.hr_attendance_policies
    WHERE is_default = true
    LIMIT 1;
    v_grace := COALESCE(v_policy_grace, 0);
  END IF;

  -- Only compute values on NEW row — do NOT write to hr_late_come_early_out
  -- The AFTER trigger (sync_late_come_early_out) handles persistence

  IF NEW.check_in IS NOT NULL THEN
    v_check_in := NEW.check_in::TIME;
    v_late_mins := EXTRACT(EPOCH FROM (v_check_in - v_shift.start_time)) / 60;
    IF v_late_mins > v_grace THEN
      NEW.late_minutes := v_late_mins::INTEGER;
    ELSE
      NEW.late_minutes := 0;
    END IF;
  END IF;

  IF NEW.check_out IS NOT NULL THEN
    v_check_out := NEW.check_out::TIME;
    v_early_mins := EXTRACT(EPOCH FROM (v_shift.end_time - v_check_out)) / 60;
    IF v_early_mins > 0 THEN
      NEW.early_leave_minutes := v_early_mins::INTEGER;
    ELSE
      NEW.early_leave_minutes := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;