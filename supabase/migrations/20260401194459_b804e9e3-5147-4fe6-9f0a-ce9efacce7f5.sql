-- Clean up UPI entries that leaked into beneficiary_records
-- These are not bank accounts and should never have been stored

-- First remove linked bank additions for these UPI beneficiaries
DELETE FROM beneficiary_bank_additions
WHERE beneficiary_id IN (
  SELECT id FROM beneficiary_records
  WHERE (ifsc_code IS NULL AND bank_name IS NULL)
);

-- Then delete the UPI beneficiary records themselves
DELETE FROM beneficiary_records
WHERE (ifsc_code IS NULL AND bank_name IS NULL);