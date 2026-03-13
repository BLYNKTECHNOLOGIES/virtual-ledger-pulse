
-- Beneficiary records: unique bank details from purchase order sellers
CREATE TABLE public.beneficiary_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text NOT NULL,
  account_holder_name text,
  ifsc_code text,
  bank_name text,
  source_order_number text,
  client_name text,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beneficiary_records_account_number_key UNIQUE (account_number)
);

-- Track which company banks each beneficiary has been added to
CREATE TABLE public.beneficiary_bank_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_records(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  CONSTRAINT beneficiary_bank_additions_unique UNIQUE (beneficiary_id, bank_account_id)
);

-- Enable RLS
ALTER TABLE public.beneficiary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiary_bank_additions ENABLE ROW LEVEL SECURITY;

-- Permissive policies for custom auth (anon role)
CREATE POLICY "Allow all access to beneficiary_records" ON public.beneficiary_records
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to beneficiary_bank_additions" ON public.beneficiary_bank_additions
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Upsert function: insert or increment occurrence
CREATE OR REPLACE FUNCTION public.upsert_beneficiary_record(
  p_account_number text,
  p_account_holder_name text DEFAULT NULL,
  p_ifsc_code text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_source_order_number text DEFAULT NULL,
  p_client_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO beneficiary_records (account_number, account_holder_name, ifsc_code, bank_name, source_order_number, client_name)
  VALUES (p_account_number, p_account_holder_name, p_ifsc_code, p_bank_name, p_source_order_number, p_client_name)
  ON CONFLICT (account_number) DO UPDATE SET
    occurrence_count = beneficiary_records.occurrence_count + 1,
    last_seen_at = now(),
    updated_at = now(),
    account_holder_name = COALESCE(EXCLUDED.account_holder_name, beneficiary_records.account_holder_name),
    ifsc_code = COALESCE(EXCLUDED.ifsc_code, beneficiary_records.ifsc_code),
    bank_name = COALESCE(EXCLUDED.bank_name, beneficiary_records.bank_name),
    client_name = COALESCE(EXCLUDED.client_name, beneficiary_records.client_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Backfill existing purchase orders that have bank details
INSERT INTO beneficiary_records (account_number, account_holder_name, ifsc_code, source_order_number, client_name, first_seen_at, last_seen_at)
SELECT DISTINCT ON (po.bank_account_number)
  po.bank_account_number,
  po.bank_account_name,
  po.ifsc_code,
  po.order_number,
  po.supplier_name,
  MIN(po.created_at) OVER (PARTITION BY po.bank_account_number),
  MAX(po.created_at) OVER (PARTITION BY po.bank_account_number)
FROM purchase_orders po
WHERE po.bank_account_number IS NOT NULL
  AND po.bank_account_number != ''
ORDER BY po.bank_account_number, po.created_at ASC
ON CONFLICT (account_number) DO NOTHING;

-- Update occurrence counts from existing data
UPDATE beneficiary_records br
SET occurrence_count = sub.cnt
FROM (
  SELECT bank_account_number, COUNT(*) as cnt
  FROM purchase_orders
  WHERE bank_account_number IS NOT NULL AND bank_account_number != ''
  GROUP BY bank_account_number
) sub
WHERE br.account_number = sub.bank_account_number;

-- Indexes
CREATE INDEX idx_beneficiary_records_account_number ON public.beneficiary_records(account_number);
CREATE INDEX idx_beneficiary_bank_additions_beneficiary ON public.beneficiary_bank_additions(beneficiary_id);
CREATE INDEX idx_beneficiary_bank_additions_bank ON public.beneficiary_bank_additions(bank_account_id);
