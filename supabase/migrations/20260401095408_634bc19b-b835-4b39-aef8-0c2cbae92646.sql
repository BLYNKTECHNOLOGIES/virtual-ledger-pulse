-- Enforce unique phone numbers across active clients at DB level
CREATE OR REPLACE FUNCTION public.enforce_unique_client_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  existing_client_id uuid;
  existing_client_name text;
BEGIN
  -- Skip if phone is null or empty
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' OR length(btrim(NEW.phone)) < 10 THEN
    RETURN NEW;
  END IF;
  
  -- Skip if client is being soft-deleted
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- Check if another active client already has this phone
  SELECT id, name INTO existing_client_id, existing_client_name
  FROM public.clients
  WHERE phone = btrim(NEW.phone)
    AND is_deleted = false
    AND id != NEW.id
  LIMIT 1;

  IF existing_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Phone number % is already assigned to client: % (ID: %)', 
      NEW.phone, existing_client_name, existing_client_id::text;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS trg_enforce_unique_client_phone ON public.clients;
CREATE TRIGGER trg_enforce_unique_client_phone
  BEFORE INSERT OR UPDATE OF phone ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_unique_client_phone();

-- Now clean up existing duplicates:
-- For each duplicate phone group, keep the most recently updated client's phone,
-- null out the rest
WITH ranked AS (
  SELECT id, phone, 
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY updated_at DESC, created_at DESC) as rn
  FROM public.clients
  WHERE is_deleted = false
    AND phone IS NOT NULL
    AND phone != ''
    AND length(phone) >= 10
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE public.clients 
SET phone = NULL
WHERE id IN (SELECT id FROM duplicates);