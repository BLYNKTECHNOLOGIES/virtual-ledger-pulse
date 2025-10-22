-- Add subsidiary_id column to bank_accounts table
ALTER TABLE bank_accounts
ADD COLUMN subsidiary_id uuid REFERENCES subsidiaries(id);

-- Add index for better query performance
CREATE INDEX idx_bank_accounts_subsidiary_id ON bank_accounts(subsidiary_id);

COMMENT ON COLUMN bank_accounts.subsidiary_id IS 'References the subsidiary/company this bank account belongs to';