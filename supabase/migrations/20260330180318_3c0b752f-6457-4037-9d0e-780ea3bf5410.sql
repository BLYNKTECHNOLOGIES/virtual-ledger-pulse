-- B56: Set first_action_at when operator first chats on an order
CREATE OR REPLACE FUNCTION public.set_first_action_at_on_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE terminal_order_assignments toa
  SET first_action_at = NOW()
  FROM p2p_order_records por
  WHERE por.id = NEW.order_id
    AND toa.order_number = por.order_number
    AND toa.is_active = true
    AND toa.first_action_at IS NULL
    AND toa.assigned_to = NEW.sender_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_first_action_at
AFTER INSERT ON p2p_order_chats
FOR EACH ROW
EXECUTE FUNCTION set_first_action_at_on_chat();

-- B57: Reject blocked phone numbers at DB level
CREATE OR REPLACE FUNCTION public.reject_blocked_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := COALESCE(NEW.client_phone, NEW.phone, NULL);
  IF v_phone IS NOT NULL AND v_phone != '' THEN
    IF EXISTS (SELECT 1 FROM blocked_phone_numbers WHERE phone = btrim(v_phone)) THEN
      RAISE EXCEPTION 'Phone number % is blocked', v_phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reject_blocked_phone_clients
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone();

CREATE TRIGGER trg_reject_blocked_phone_onboarding
BEFORE INSERT OR UPDATE ON client_onboarding_approvals
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone();

CREATE TRIGGER trg_reject_blocked_phone_sales
BEFORE INSERT OR UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone();