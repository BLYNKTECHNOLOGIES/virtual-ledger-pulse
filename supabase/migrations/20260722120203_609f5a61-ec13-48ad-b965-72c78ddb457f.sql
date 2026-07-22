CREATE UNIQUE INDEX IF NOT EXISTS ux_coa_pending_sales_order
  ON public.client_onboarding_approvals (sales_order_id)
  WHERE approval_status = 'PENDING' AND sales_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_coa_pending_cp_userno
  ON public.client_onboarding_approvals (cp_userno)
  WHERE approval_status = 'PENDING' AND cp_userno IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_coa_pending_resolved_client
  ON public.client_onboarding_approvals (resolved_client_id)
  WHERE approval_status = 'PENDING' AND resolved_client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_unique_client_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  existing_client_id uuid;
  existing_client_name text;
  new_phone_digits text;
BEGIN
  new_phone_digits := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), '');

  -- Skip if phone is null/empty/too short.
  IF new_phone_digits IS NULL OR length(new_phone_digits) < 10 THEN
    RETURN NEW;
  END IF;

  -- Store a trimmed value, but compare by normalized digits.
  NEW.phone := btrim(NEW.phone);

  -- Skip if client is being soft-deleted.
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  SELECT id, name INTO existing_client_id, existing_client_name
  FROM public.clients
  WHERE is_deleted = false
    AND id != NEW.id
    AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = new_phone_digits
  LIMIT 1;

  IF existing_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Phone number % is already assigned to client: % (ID: %)',
      NEW.phone, existing_client_name, existing_client_id::text;
  END IF;

  RETURN NEW;
END;
$function$;