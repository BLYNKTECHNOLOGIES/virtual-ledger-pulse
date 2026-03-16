ALTER TABLE public.beneficiary_records
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS account_opening_branch text;

CREATE OR REPLACE FUNCTION public.upsert_beneficiary_record(
  p_account_number text,
  p_account_holder_name text DEFAULT NULL,
  p_ifsc_code text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_source_order_number text DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_account_type text DEFAULT NULL,
  p_account_opening_branch text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO beneficiary_records (
    account_number,
    account_holder_name,
    ifsc_code,
    bank_name,
    source_order_number,
    client_name,
    account_type,
    account_opening_branch
  )
  VALUES (
    p_account_number,
    p_account_holder_name,
    p_ifsc_code,
    p_bank_name,
    p_source_order_number,
    p_client_name,
    p_account_type,
    p_account_opening_branch
  )
  ON CONFLICT (account_number) DO UPDATE SET
    occurrence_count = beneficiary_records.occurrence_count + 1,
    last_seen_at = now(),
    updated_at = now(),
    account_holder_name = COALESCE(EXCLUDED.account_holder_name, beneficiary_records.account_holder_name),
    ifsc_code = COALESCE(EXCLUDED.ifsc_code, beneficiary_records.ifsc_code),
    bank_name = COALESCE(EXCLUDED.bank_name, beneficiary_records.bank_name),
    client_name = COALESCE(EXCLUDED.client_name, beneficiary_records.client_name),
    account_type = COALESCE(EXCLUDED.account_type, beneficiary_records.account_type),
    account_opening_branch = COALESCE(EXCLUDED.account_opening_branch, beneficiary_records.account_opening_branch)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;