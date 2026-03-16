
-- Table to store bank-specific bulk upload CSV format configurations
CREATE TABLE public.bank_bulk_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_key TEXT NOT NULL UNIQUE,  -- e.g. 'PSB', 'SBI', etc.
  bank_display_name TEXT NOT NULL,
  columns JSONB NOT NULL,  -- ordered array of column definitions
  default_values JSONB DEFAULT '{}',  -- default values for columns
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_bulk_formats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bank_bulk_formats"
  ON public.bank_bulk_formats FOR SELECT TO authenticated USING (true);

-- Seed PSB format based on the exact template
INSERT INTO public.bank_bulk_formats (bank_key, bank_display_name, columns, default_values) VALUES (
  'PSB',
  'Punjab & Sind Bank',
  '[
    {"key": "payee_type", "header": "Payee Type -WITHIN/ OUTSIDE\n\n(for PSB to PSB- WITHIN)\n(for PSB to other bank- OUTSIDE)", "source": "default"},
    {"key": "account_no", "header": "Beneficiary Account No (for Punjab & Sind Bank 14 digit number)\n(for Outside PSB, 9-35 characters are allowed)", "source": "account_number"},
    {"key": "ifsc", "header": "IFSC (Always 11 character alphanumeric and 5th character always 0 (zero)) (For Punjab & Sind Bank accounts keep it blank)", "source": "ifsc_code"},
    {"key": "name", "header": "Beneficiary Name (Max length 32 Character) (No Special Character is allowed but Space is allowed)", "source": "account_holder_name", "max_length": 32, "strip_special": true},
    {"key": "nick_name", "header": "Beneficiary Nick Name (Max length 10 Character) (No Special Character is allowed but Space is allowed)", "source": "account_holder_name", "max_length": 10, "strip_special": true},
    {"key": "txn_limit", "header": "Transaction Limit Amount (₹)\n(Should not be more than 12 digit including decimals and paise)", "source": "default"}
  ]'::jsonb,
  '{"payee_type": "OUTSIDE", "txn_limit": "1000000.00"}'::jsonb
);
