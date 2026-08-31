CREATE OR REPLACE FUNCTION public.validate_leave_request_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end_date (%) cannot be before start_date (%)', NEW.end_date, NEW.start_date;
  END IF;
  IF NEW.total_days IS NOT NULL AND NEW.total_days <= 0 THEN
    RAISE EXCEPTION 'Leave total_days must be greater than 0, got %', NEW.total_days;
  END IF;
  -- LEAVE-04 (revised): backdating is allowed inside the current calendar month.
  IF NEW.start_date < date_trunc('month', CURRENT_DATE)::DATE THEN
    RAISE EXCEPTION 'Leave start_date (%) cannot be before the start of the current month (%)',
      NEW.start_date, date_trunc('month', CURRENT_DATE)::DATE;
  END IF;
  RETURN NEW;
END;
$function$;