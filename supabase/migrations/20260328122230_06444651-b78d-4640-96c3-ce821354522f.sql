-- Fix F5: Use client_id (FK) for existence check instead of fuzzy name match
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    -- Use client_id when available (set by trg_auto_fill_client_id), fall back to name
    IF NEW.client_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.clients WHERE id = NEW.client_id
      ) THEN
        INSERT INTO public.client_onboarding_approvals (
          sales_order_id, client_name, client_phone,
          order_amount, order_date
        ) VALUES (
          NEW.id, NEW.client_name, NEW.client_phone,
          NEW.total_amount, NEW.order_date
        );
      END IF;
    ELSE
      -- No client_id: fall back to case-insensitive name match
      IF NOT EXISTS (
        SELECT 1 FROM public.clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name))
      ) THEN
        INSERT INTO public.client_onboarding_approvals (
          sales_order_id, client_name, client_phone,
          order_amount, order_date
        ) VALUES (
          NEW.id, NEW.client_name, NEW.client_phone,
          NEW.total_amount, NEW.order_date
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;