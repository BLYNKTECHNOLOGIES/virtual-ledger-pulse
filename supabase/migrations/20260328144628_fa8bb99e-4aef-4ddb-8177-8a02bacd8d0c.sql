
CREATE OR REPLACE FUNCTION public.validate_unique_client_bank_numbers()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  account JSONB;
  acc_number TEXT;
  duplicate_client_id UUID;
  duplicate_client_name TEXT;
BEGIN
  -- Only validate if linked_bank_accounts is being set/changed
  IF NEW.linked_bank_accounts IS NULL OR jsonb_array_length(NEW.linked_bank_accounts) = 0 THEN
    RETURN NEW;
  END IF;

  -- Check each account number in the new data
  FOR account IN SELECT jsonb_array_elements(NEW.linked_bank_accounts)
  LOOP
    acc_number := account ->> 'account_number';
    
    -- Skip if account_number is null or empty
    IF acc_number IS NULL OR TRIM(acc_number) = '' THEN
      CONTINUE;
    END IF;

    -- Check for duplicates in OTHER active (non-deleted) clients
    SELECT c.id, c.name INTO duplicate_client_id, duplicate_client_name
    FROM clients c,
         jsonb_array_elements(c.linked_bank_accounts) AS elem
    WHERE c.id != NEW.id
      AND c.is_deleted = false
      AND elem ->> 'account_number' = acc_number
    LIMIT 1;

    IF duplicate_client_id IS NOT NULL THEN
      RAISE EXCEPTION 'Bank account number % is already linked to client "%" (ID: %). Each bank account number must be unique across active clients.',
        acc_number, duplicate_client_name, duplicate_client_id;
    END IF;

    -- Also check for duplicates WITHIN the same client's array
    IF (SELECT COUNT(*) FROM jsonb_array_elements(NEW.linked_bank_accounts) AS e WHERE e ->> 'account_number' = acc_number) > 1 THEN
      RAISE EXCEPTION 'Duplicate bank account number % within the same client record. Each account number must appear only once.',
        acc_number;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
