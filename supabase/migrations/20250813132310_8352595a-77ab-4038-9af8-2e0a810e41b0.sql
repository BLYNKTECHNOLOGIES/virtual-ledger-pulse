-- Update the validation trigger to include bypass logic
CREATE OR REPLACE FUNCTION public.validate_balance_edit()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Check if bypass flag is set (for trusted admin operations)
  IF current_setting('app.bypass_balance_lock', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Allow balance updates if:
  -- 1. Balance is not locked (NEW.balance_locked is false)
  -- 2. This is an automatic update (updated_at is being changed)
  -- 3. We're unlocking the account (OLD.balance_locked = true AND NEW.balance_locked = false)
  IF OLD.balance_locked = true AND NEW.balance != OLD.balance AND 
     NEW.updated_at = OLD.updated_at AND NEW.balance_locked = true THEN
    RAISE EXCEPTION 'Cannot modify balance: Account balance is locked due to existing transactions';
  END IF;
  
  RETURN NEW;
END;
$$;