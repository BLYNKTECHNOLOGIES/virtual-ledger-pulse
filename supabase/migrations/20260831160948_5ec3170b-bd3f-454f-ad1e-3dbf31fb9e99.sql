CREATE OR REPLACE FUNCTION public.validate_pricing_rule_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.auto_pause_after_deviations IS NOT NULL AND
     (NEW.auto_pause_after_deviations < 0 OR NEW.auto_pause_after_deviations > 100) THEN
    RAISE EXCEPTION 'auto_pause_after_deviations must be between 0 and 100 (0 = never auto-pause), got %', NEW.auto_pause_after_deviations;
  END IF;
  RETURN NEW;
END;
$$;