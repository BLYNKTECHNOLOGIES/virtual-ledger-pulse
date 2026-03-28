
-- B1: Fix duplicate onboarding approvals
-- Add deduplication: skip if a PENDING approval already exists for this client

CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    IF NEW.client_id IS NOT NULL THEN
      -- Skip if client already exists
      IF EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
        RETURN NEW;
      END IF;
      -- Skip if a PENDING or APPROVED approval already exists for this client_id or name
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING', 'APPROVED')
          AND (
            client_name = NEW.client_name
            OR client_phone = NEW.client_phone
          )
      ) THEN
        RETURN NEW;
      END IF;
    ELSE
      -- No client_id: check by name
      IF EXISTS (SELECT 1 FROM public.clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name))) THEN
        RETURN NEW;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING', 'APPROVED')
          AND LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name))
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    INSERT INTO public.client_onboarding_approvals (
      sales_order_id, client_name, client_phone,
      order_amount, order_date
    ) VALUES (
      NEW.id, NEW.client_name, NEW.client_phone,
      NEW.total_amount, NEW.order_date
    );
  END IF;
  RETURN NEW;
END;
$$;

-- B2: Add cancelled and on_hold to erp_task_status enum
ALTER TYPE erp_task_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE erp_task_status ADD VALUE IF NOT EXISTS 'on_hold';
