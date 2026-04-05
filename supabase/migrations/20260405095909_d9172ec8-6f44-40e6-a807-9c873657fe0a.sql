
CREATE OR REPLACE FUNCTION public.fn_validate_resignation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.resignation_status IS NOT NULL AND NEW.resignation_status NOT IN (
    'pending_approval', 'notice_period', 'completed', 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'Invalid resignation_status: %. Allowed: pending_approval, notice_period, completed, withdrawn', NEW.resignation_status;
  END IF;

  -- When resignation is completed, deactivate the employee
  IF NEW.resignation_status = 'completed' AND (OLD.resignation_status IS DISTINCT FROM 'completed') THEN
    NEW.is_active := false;
  END IF;

  -- When resignation is withdrawn, clear resignation fields
  IF NEW.resignation_status = 'withdrawn' AND (OLD.resignation_status IS DISTINCT FROM 'withdrawn') THEN
    NEW.resignation_date := NULL;
    NEW.notice_period_end_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;
