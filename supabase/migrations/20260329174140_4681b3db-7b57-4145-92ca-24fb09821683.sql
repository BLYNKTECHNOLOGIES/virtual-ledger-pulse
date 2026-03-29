
-- Fix AP-MISS-04: Cooldown trigger should silently preserve old values (per audit recommendation)
-- instead of raising an exception, which would break the edge function flow
CREATE OR REPLACE FUNCTION enforce_pricing_cooldown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when price/ratio is being changed by the engine
  IF (NEW.last_applied_price IS DISTINCT FROM OLD.last_applied_price OR
      NEW.last_applied_ratio IS DISTINCT FROM OLD.last_applied_ratio) THEN
    IF OLD.manual_override_cooldown_minutes > 0 AND OLD.last_manual_edit_at IS NOT NULL THEN
      IF now() < OLD.last_manual_edit_at + (OLD.manual_override_cooldown_minutes || ' minutes')::interval THEN
        -- Silently preserve old values instead of raising exception
        NEW.last_applied_price := OLD.last_applied_price;
        NEW.last_applied_ratio := OLD.last_applied_ratio;
        -- Allow other fields (last_checked_at, etc.) to update normally
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
