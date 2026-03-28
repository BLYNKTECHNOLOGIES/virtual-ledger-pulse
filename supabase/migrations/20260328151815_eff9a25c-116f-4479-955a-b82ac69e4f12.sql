
-- B1 FIX: Correct deduplication logic
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    IF NEW.client_id IS NOT NULL THEN
      -- Skip if client already exists
      IF EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
        RETURN NEW;
      END IF;
      -- Skip if a PENDING or APPROVED approval already exists (case-insensitive name, NULL-safe phone)
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING', 'APPROVED')
          AND (
            LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name))
            OR (NEW.client_phone IS NOT NULL AND NEW.client_phone != '' 
                AND client_phone IS NOT DISTINCT FROM NEW.client_phone)
          )
      ) THEN
        RETURN NEW;
      END IF;
    ELSE
      -- No client_id: check by name
      IF EXISTS (SELECT 1 FROM public.clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name))) THEN
        RETURN NEW;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING', 'APPROVED')
          AND LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name))
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    INSERT INTO public.client_onboarding_approvals (
      sales_order_id, client_name, client_phone,
      order_amount, order_date
    ) VALUES (
      NEW.id, NEW.client_name, NEW.client_phone,
      NEW.total_amount, NEW.order_date
    );
  END IF;
  RETURN NEW;
END;
$$;

-- C5 FIX: Improved payroll lock + payslip protection
CREATE OR REPLACE FUNCTION public.enforce_payroll_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.is_locked = false THEN
      -- Unlocking: only is_locked may change
      IF NEW IS DISTINCT FROM (OLD.* #= hstore('is_locked', 'false')) THEN
        -- Fallback: compare key financial fields
        IF NEW.total_gross IS DISTINCT FROM OLD.total_gross
          OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
          OR NEW.total_net IS DISTINCT FROM OLD.total_net
          OR NEW.status IS DISTINCT FROM OLD.status THEN
          RAISE EXCEPTION 'Cannot modify payroll run fields while unlocking. Only is_locked can change.';
        END IF;
      END IF;
    ELSE
      -- Still locked, block all changes
      RAISE EXCEPTION 'Payroll run % is locked and cannot be modified. Unlock it first.', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- C5 FIX: Protect payslips when parent payroll run is locked
CREATE OR REPLACE FUNCTION public.enforce_payslip_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  run_locked BOOLEAN;
BEGIN
  SELECT is_locked INTO run_locked
  FROM public.hr_payroll_runs
  WHERE id = NEW.payroll_run_id;

  IF run_locked = true THEN
    RAISE EXCEPTION 'Cannot modify payslip: payroll run % is locked.', NEW.payroll_run_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_payslip_lock
  BEFORE UPDATE OR DELETE ON hr_payslips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payslip_lock();
