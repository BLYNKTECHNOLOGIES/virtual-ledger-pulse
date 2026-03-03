-- Enforce unique bank account/card numbers across clients.linked_bank_accounts JSON
-- This prevents the same account number from being assigned to multiple clients.

CREATE OR REPLACE FUNCTION public.extract_client_bank_number(account_entry jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      COALESCE(
        account_entry->>'account_number',
        account_entry->>'accountNumber',
        account_entry->>'bank_account_number',
        account_entry->>'bankAccountNumber',
        account_entry->>'card_number',
        account_entry->>'cardNumber',
        ''
      ),
      '[^A-Za-z0-9]',
      '',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.validate_unique_client_bank_numbers()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bank_number text;
  seen_numbers text[] := ARRAY[]::text[];
BEGIN
  -- Nothing to validate when no bank accounts are provided
  IF NEW.linked_bank_accounts IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_bank_number IN
    SELECT public.extract_client_bank_number(elem)
    FROM jsonb_array_elements(COALESCE(NEW.linked_bank_accounts, '[]'::jsonb)) AS elem
  LOOP
    -- Skip empty/unusable values and short fragments like last-4-digit tokens
    IF v_bank_number IS NULL OR length(v_bank_number) < 8 THEN
      CONTINUE;
    END IF;

    -- Prevent duplicate numbers inside the same client payload
    IF v_bank_number = ANY(seen_numbers) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format('Duplicate bank account number (%s) in the same client profile.', v_bank_number);
    END IF;

    seen_numbers := array_append(seen_numbers, v_bank_number);

    -- Prevent duplicate numbers across different clients
    IF EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(c.is_deleted, false) = false
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.linked_bank_accounts, '[]'::jsonb)) AS existing_elem
          WHERE public.extract_client_bank_number(existing_elem) = v_bank_number
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format('Bank account number (%s) is already linked to another client.', v_bank_number);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_unique_client_bank_numbers ON public.clients;
CREATE TRIGGER trg_validate_unique_client_bank_numbers
BEFORE INSERT OR UPDATE OF linked_bank_accounts ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.validate_unique_client_bank_numbers();