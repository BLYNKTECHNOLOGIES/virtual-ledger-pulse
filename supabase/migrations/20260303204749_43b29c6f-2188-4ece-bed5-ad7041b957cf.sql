-- Security hardening: set explicit search_path on newly added functions

CREATE OR REPLACE FUNCTION public.extract_client_bank_number(account_entry jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
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
SET search_path = public
AS $$
DECLARE
  v_bank_number text;
  seen_numbers text[] := ARRAY[]::text[];
BEGIN
  IF NEW.linked_bank_accounts IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_bank_number IN
    SELECT public.extract_client_bank_number(elem)
    FROM jsonb_array_elements(COALESCE(NEW.linked_bank_accounts, '[]'::jsonb)) AS elem
  LOOP
    IF v_bank_number IS NULL OR length(v_bank_number) < 8 THEN
      CONTINUE;
    END IF;

    IF v_bank_number = ANY(seen_numbers) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format('Duplicate bank account number (%s) in the same client profile.', v_bank_number);
    END IF;

    seen_numbers := array_append(seen_numbers, v_bank_number);

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