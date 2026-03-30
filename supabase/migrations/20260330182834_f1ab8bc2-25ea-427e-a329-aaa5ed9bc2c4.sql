
-- Fix B58: reject_blocked_phone crashes because COALESCE(NEW.client_phone, NEW.phone)
-- references columns that don't exist on some tables. Split into per-table functions.

DROP TRIGGER IF EXISTS trg_reject_blocked_phone_clients ON clients;
DROP TRIGGER IF EXISTS trg_reject_blocked_phone_onboarding ON client_onboarding_approvals;
DROP TRIGGER IF EXISTS trg_reject_blocked_phone_sales ON sales_orders;
DROP FUNCTION IF EXISTS reject_blocked_phone();

-- clients table uses "phone"
CREATE OR REPLACE FUNCTION public.reject_blocked_phone_clients()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    IF EXISTS (SELECT 1 FROM blocked_phone_numbers WHERE phone = btrim(NEW.phone)) THEN
      RAISE EXCEPTION 'Phone number % is blocked', NEW.phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- sales_orders and client_onboarding_approvals use "client_phone"
CREATE OR REPLACE FUNCTION public.reject_blocked_phone_client_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NEW.client_phone IS NOT NULL AND NEW.client_phone != '' THEN
    IF EXISTS (SELECT 1 FROM blocked_phone_numbers WHERE phone = btrim(NEW.client_phone)) THEN
      RAISE EXCEPTION 'Phone number % is blocked', NEW.client_phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reject_blocked_phone_clients
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone_clients();

CREATE TRIGGER trg_reject_blocked_phone_onboarding
BEFORE INSERT OR UPDATE ON client_onboarding_approvals
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone_client_phone();

CREATE TRIGGER trg_reject_blocked_phone_sales
BEFORE INSERT OR UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone_client_phone();
