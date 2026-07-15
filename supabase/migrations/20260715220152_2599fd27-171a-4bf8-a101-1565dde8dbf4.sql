
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS push_bank_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_bank_pilot_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_bank_pilot_hr_employee_id uuid,
  ADD COLUMN IF NOT EXISTS bulk_bank_push_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_bank_push_at timestamptz;

-- Row-level validator: PAN + IFSC + non-empty account + account-holder name derivable.
-- Returns jsonb {valid: bool, reasons: text[]} so the proxy can render per-row status.
CREATE OR REPLACE FUNCTION public.validate_bank_details_row(_hr_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp record;
  bd  record;
  reasons text[] := ARRAY[]::text[];
BEGIN
  SELECT id, first_name, last_name, pan_number
    INTO emp
  FROM public.hr_employees
  WHERE id = _hr_employee_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reasons', ARRAY['employee_not_found']);
  END IF;

  SELECT account_number, ifsc_code, bank_name
    INTO bd
  FROM public.hr_employee_bank_details
  WHERE employee_id = _hr_employee_id
  LIMIT 1;

  IF NOT FOUND THEN
    reasons := array_append(reasons, 'bank_details_missing');
  ELSE
    IF bd.account_number IS NULL OR length(btrim(bd.account_number)) < 6 THEN
      reasons := array_append(reasons, 'account_number_invalid');
    END IF;
    -- IFSC: 4 uppercase letters + 0 + 6 alphanumerics (Indian standard)
    IF bd.ifsc_code IS NULL OR bd.ifsc_code !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
      reasons := array_append(reasons, 'ifsc_invalid');
    END IF;
  END IF;

  -- PAN: strict AAAAA9999A
  IF emp.pan_number IS NULL OR emp.pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    reasons := array_append(reasons, 'pan_invalid');
  END IF;

  IF coalesce(btrim(emp.first_name),'') = '' AND coalesce(btrim(emp.last_name),'') = '' THEN
    reasons := array_append(reasons, 'account_holder_name_missing');
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(reasons, 1) IS NULL,
    'reasons', reasons
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_bank_details_row(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bank_details_row(uuid) TO service_role;
