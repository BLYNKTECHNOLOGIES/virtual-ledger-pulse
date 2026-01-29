-- Revert HDFC SS bank account from CLOSED back to ACTIVE
UPDATE public.bank_accounts 
SET account_status = 'ACTIVE' 
WHERE id = '4a4d81ee-0e20-4979-8b8b-2c88514d2668';