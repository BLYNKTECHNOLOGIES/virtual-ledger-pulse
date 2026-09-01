CREATE OR REPLACE FUNCTION public.validate_leave_request_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end_date (%) cannot be before start_date (%)', NEW.end_date, NEW.start_date;
  END IF;
  IF NEW.total_days IS NOT NULL AND NEW.total_days <= 0 THEN
    RAISE EXCEPTION 'Leave total_days must be greater than 0, got %', NEW.total_days;
  END IF;
  -- LEAVE-04 (revised): backdating is allowed inside the current calendar month.
  -- Only enforce on INSERT, or on UPDATE when the dates themselves change.
  -- Status-only updates (manager/HR approval after month-end) must not be blocked.
  IF (TG_OP = 'INSERT' OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND NEW.start_date < date_trunc('month', CURRENT_DATE)::DATE THEN
    RAISE EXCEPTION 'Leave start_date (%) cannot be before the start of the current month (%)',
      NEW.start_date, date_trunc('month', CURRENT_DATE)::DATE;
  END IF;
  RETURN NEW;
END;
$function$;