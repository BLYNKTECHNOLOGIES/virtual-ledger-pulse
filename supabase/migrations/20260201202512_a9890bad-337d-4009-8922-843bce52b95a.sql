-- Fix the enforce_purchase_order_status_rules trigger to:
-- 1. Allow added_to_bank without TDS requirement
-- 2. Only enforce auth checks for sensitive status transitions (paid, completed)
-- 3. Skip enforcement when auth context is unavailable (e.g., RPC or background updates)

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_status_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_has_creator boolean;
BEGIN
  -- Only apply checks for specific status transitions
  -- Skip if no status change
  IF (OLD.order_status IS NOT DISTINCT FROM NEW.order_status) THEN
    RETURN NEW;
  END IF;
  
  -- Get user ID - but don't block if not available (allows RPC/service calls)
  v_uid := auth.uid();
  
  -- Check for completion transition - requires Purchase Creator role
  IF (NEW.order_status = 'completed' AND OLD.order_status IS DISTINCT FROM 'completed') THEN
    -- Only enforce role check if we have an authenticated user
    IF v_uid IS NOT NULL THEN
      v_has_creator := public.user_has_function(v_uid, 'purchase_creator');
      IF NOT v_has_creator THEN
        RAISE EXCEPTION 'Only Purchase Creator may complete orders';
      END IF;
    END IF;
  END IF;
  
  -- Check for paid transition - requires TDS details
  IF (NEW.order_status = 'paid' AND OLD.order_status IS DISTINCT FROM 'paid') THEN
    IF NOT (
      NEW.pan_number IS NOT NULL
      OR (NEW.notes IS NOT NULL AND NEW.notes LIKE '%pan_type:%')
    ) THEN
      RAISE EXCEPTION 'Cannot mark paid before TDS details are provided';
    END IF;
  END IF;
  
  -- Added to bank transition: NO restrictions
  -- This allows Payer to add to bank as soon as banking details are collected
  -- TDS/PAN is NOT required for added_to_bank
  
  RETURN NEW;
END;
$$;