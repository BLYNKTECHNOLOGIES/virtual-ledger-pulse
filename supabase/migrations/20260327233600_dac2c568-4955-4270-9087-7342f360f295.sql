-- Fix bank ledger drift for 3 accounts
-- The balance trigger auto-fires on INSERT/DELETE, so we disable it during ledger corrections
-- then force-reset balances to their correct physical values

BEGIN;

-- 1. Disable balance trigger temporarily
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_update_bank_account_balance;
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_check_bank_balance;

-- 2. Delete wrongly-typed OPENING_BALANCE EXPENSE entries
DELETE FROM public.bank_transactions 
WHERE id IN (
  'c5b4b377-e6f9-42f3-9b2e-122f955d03b1',  -- ICICI BLYNK wrong OB EXPENSE
  '99e3b00e-1b12-45bf-b10f-992f004671ad'    -- IPAY DIGI wrong OB EXPENSE
);

-- 3. Insert correct OPENING_BALANCE INCOME entries (exact correction amounts)
-- ICICI BLYNK: tracked 143,663.57, calculated -755,336.48, correction = 899,000.05
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, category, description, transaction_date)
VALUES ('df678cad-0b88-4bc9-b7a6-429ebd6b9604', 'INCOME', 899000.0466, 'OPENING_BALANCE', 'Ledger sync: Opening balance correction for ICICI BLYNK', now()::date);

-- JANA BANK: tracked 176,013.30, calculated -266,747.69, correction = 442,760.99
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, category, description, transaction_date)
VALUES ('99bdfe41-e689-45e9-b563-31a59a89388a', 'INCOME', 442760.9920, 'OPENING_BALANCE', 'Ledger sync: Opening balance correction for JANA BANK', now()::date);

-- IPAY DIGI: tracked 41,734.82, calculated -190,142.56, correction = 231,877.38
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, category, description, transaction_date)
VALUES ('4a08c92a-a814-4318-a450-ffa2f294ea1c', 'INCOME', 231877.3800, 'OPENING_BALANCE', 'Ledger sync: Opening balance correction for IPAY DIGI', now()::date);

-- 4. Re-enable triggers
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_update_bank_account_balance;
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_check_bank_balance;

-- 5. Force-reset balances to correct physical values (since triggers were disabled)
UPDATE public.bank_accounts SET balance = 143663.57, updated_at = now() WHERE id = 'df678cad-0b88-4bc9-b7a6-429ebd6b9604';
UPDATE public.bank_accounts SET balance = 176013.30, updated_at = now() WHERE id = '99bdfe41-e689-45e9-b563-31a59a89388a';
UPDATE public.bank_accounts SET balance = 41734.82, updated_at = now() WHERE id = '4a08c92a-a814-4318-a450-ffa2f294ea1c';

COMMIT;