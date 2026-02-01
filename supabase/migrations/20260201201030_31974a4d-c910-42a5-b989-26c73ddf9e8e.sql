-- Enforce purchase-order authority and prerequisites at the DB level

-- 1) Helper: does a user have a given system function key?
CREATE OR REPLACE FUNCTION public.user_has_function(_user_id uuid, _function_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.get_user_role_functions(_user_id) f
    WHERE f.function_key = _function_key
  );
$$;

-- 2) Trigger: block unauthorized status transitions
CREATE OR REPLACE FUNCTION public.enforce_purchase_order_status_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_has_creator boolean;
BEGIN
  v_uid := auth.uid();

  -- If not authenticated, block status transitions.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_has_creator := public.user_has_function(v_uid, 'purchase_creator');

  -- Only Purchase Creator (or Combined, which includes purchase_creator) may complete.
  IF (NEW.order_status = 'completed' AND (OLD.order_status IS DISTINCT FROM 'completed')) THEN
    IF NOT v_has_creator THEN
      RAISE EXCEPTION 'Only Purchase Creator may complete orders';
    END IF;
  END IF;

  -- Payment can be marked as paid only after TDS details exist.
  -- TDS details are considered present if:
  -- - pan_number is set, OR
  -- - notes contains a pan_type marker (e.g. [pan_type:non_tds])
  IF (NEW.order_status = 'paid' AND (OLD.order_status IS DISTINCT FROM 'paid')) THEN
    IF NOT (
      NEW.pan_number IS NOT NULL
      OR (NEW.notes IS NOT NULL AND NEW.notes LIKE '%pan_type:%')
    ) THEN
      RAISE EXCEPTION 'Cannot mark paid before TDS details are provided';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_purchase_order_status_rules ON public.purchase_orders;
CREATE TRIGGER trg_enforce_purchase_order_status_rules
BEFORE UPDATE OF order_status ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_purchase_order_status_rules();
