-- =====================================================
-- 1. WORKFLOW #1: Leave balance trigger on approval/cancellation
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_leave_balance_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On approval: deduct from allocation
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE hr_leave_allocations
    SET used_days = used_days + NEW.total_days,
        available_days = available_days - NEW.total_days,
        updated_at = now()
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int;
  END IF;

  -- On cancellation/rejection from approved: reverse deduction
  IF OLD.status = 'approved' AND NEW.status IN ('cancelled', 'rejected') THEN
    UPDATE hr_leave_allocations
    SET used_days = GREATEST(0, used_days - OLD.total_days),
        available_days = available_days + OLD.total_days,
        updated_at = now()
    WHERE employee_id = OLD.employee_id
      AND leave_type_id = OLD.leave_type_id
      AND year = EXTRACT(YEAR FROM OLD.start_date)::int;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance_on_status_change ON hr_leave_requests;
CREATE TRIGGER trg_leave_balance_on_status_change
  AFTER UPDATE OF status ON hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_leave_balance_on_status_change();

-- Leave validation trigger: block approval if insufficient balance
CREATE OR REPLACE FUNCTION public.fn_validate_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
  v_leave_code text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    -- Skip validation for LOP
    SELECT code INTO v_leave_code FROM hr_leave_types WHERE id = NEW.leave_type_id;
    IF v_leave_code = 'LOP' THEN
      RETURN NEW;
    END IF;

    SELECT available_days INTO v_available
    FROM hr_leave_allocations
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'No leave allocation found for this employee and leave type for year %', EXTRACT(YEAR FROM NEW.start_date)::int;
    END IF;

    IF v_available < NEW.total_days THEN
      RAISE EXCEPTION 'Insufficient leave balance. Available: %, Requested: %', v_available, NEW.total_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_leave_balance ON hr_leave_requests;
CREATE TRIGGER trg_validate_leave_balance
  BEFORE UPDATE OF status ON hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_leave_balance();

-- =====================================================
-- 2. MISSING #1: Salary revision history
-- =====================================================

CREATE TABLE IF NOT EXISTS hr_salary_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  previous_basic numeric,
  new_basic numeric,
  previous_total numeric,
  new_total numeric,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  revision_type text NOT NULL DEFAULT 'correction',
  revision_reason text,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hr_salary_revisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_salary_revision_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.basic_salary IS DISTINCT FROM NEW.basic_salary) OR (OLD.total_salary IS DISTINCT FROM NEW.total_salary) THEN
    INSERT INTO hr_salary_revisions (employee_id, previous_basic, new_basic, previous_total, new_total, revision_type)
    VALUES (NEW.id, OLD.basic_salary, NEW.basic_salary, OLD.total_salary, NEW.total_salary, 'correction');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salary_revision_on_change ON hr_employees;
CREATE TRIGGER trg_salary_revision_on_change
  AFTER UPDATE OF basic_salary, total_salary ON hr_employees
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_salary_revision_on_change();

-- =====================================================
-- 3. MISSING #2: F&F Settlement
-- =====================================================

CREATE TABLE IF NOT EXISTS hr_fnf_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  last_working_day date NOT NULL,
  pending_salary numeric NOT NULL DEFAULT 0,
  leave_encashment_days numeric NOT NULL DEFAULT 0,
  leave_encashment_amount numeric NOT NULL DEFAULT 0,
  bonus_amount numeric NOT NULL DEFAULT 0,
  loan_recovery numeric NOT NULL DEFAULT 0,
  deposit_refund numeric NOT NULL DEFAULT 0,
  penalty_deductions numeric NOT NULL DEFAULT 0,
  other_deductions numeric NOT NULL DEFAULT 0,
  other_deductions_notes text,
  net_payable numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  approved_by text,
  paid_at timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hr_fnf_settlements ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. MISSING #3: Employee documents
-- =====================================================

CREATE TABLE IF NOT EXISTS hr_employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_name text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text,
  is_verified boolean NOT NULL DEFAULT false,
  verified_by text,
  verified_at timestamptz,
  notes text
);

ALTER TABLE hr_employee_documents ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. MISSING #4: Probation tracking
-- =====================================================

ALTER TABLE hr_employee_work_info 
  ADD COLUMN IF NOT EXISTS probation_end_date date,
  ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by text;