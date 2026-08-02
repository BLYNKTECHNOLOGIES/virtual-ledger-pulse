CREATE OR REPLACE FUNCTION public.fn_validate_loan_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'active', 'paused', 'closed') THEN
    RAISE EXCEPTION 'Invalid loan status: %. Allowed: pending, approved, rejected, active, paused, closed', NEW.status;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'New loans must start with status pending, got: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending' THEN
      IF NEW.status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Loan cannot transition from pending to %. Allowed: approved, rejected', NEW.status;
      END IF;
    WHEN 'approved' THEN
      IF NEW.status NOT IN ('active', 'rejected') THEN
        RAISE EXCEPTION 'Loan cannot transition from approved to %. Allowed: active, rejected', NEW.status;
      END IF;
    WHEN 'active' THEN
      IF NEW.status NOT IN ('paused', 'closed') THEN
        RAISE EXCEPTION 'Loan cannot transition from active to %. Allowed: paused, closed', NEW.status;
      END IF;
    WHEN 'paused' THEN
      IF NEW.status NOT IN ('active', 'closed') THEN
        RAISE EXCEPTION 'Loan cannot transition from paused to %. Allowed: active, closed', NEW.status;
      END IF;
    WHEN 'rejected' THEN
      RAISE EXCEPTION 'Loan status "rejected" is terminal and cannot be changed';
    WHEN 'closed' THEN
      RAISE EXCEPTION 'Loan status "closed" is terminal and cannot be changed';
    ELSE
      RAISE EXCEPTION 'Unknown current loan status: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$function$;