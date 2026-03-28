-- Fix F11: Correct column reference from comp_off_date to credit_date
CREATE OR REPLACE FUNCTION public.set_compoff_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.credit_date + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;