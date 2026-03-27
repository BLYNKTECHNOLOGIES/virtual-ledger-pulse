-- Fix remaining drift for ICICI BLYNK and IPAY DIGI
-- Calculated is higher than tracked, so we need EXPENSE adjustments

BEGIN;

ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_update_bank_account_balance;
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_check_bank_balance;

-- ICICI BLYNK: calculated 1,075,924.26, tracked 143,663.57, need EXPENSE of 932,260.6865
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, category, description, transaction_date)
VALUES ('df678cad-0b88-4bc9-b7a6-429ebd6b9604', 'EXPENSE', 932260.6865, 'OPENING_BALANCE', 'Ledger sync: Pre-ERP debit adjustment for ICICI BLYNK', now()::date);

-- IPAY DIGI: calculated 71,995.08, tracked 41,734.82, need EXPENSE of 30,260.2598
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, category, description, transaction_date)
VALUES ('4a08c92a-a814-4318-a450-ffa2f294ea1c', 'EXPENSE', 30260.2598, 'OPENING_BALANCE', 'Ledger sync: Pre-ERP debit adjustment for IPAY DIGI', now()::date);

ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_update_bank_account_balance;
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_check_bank_balance;

-- Balances stay as-is since triggers were disabled
COMMIT;