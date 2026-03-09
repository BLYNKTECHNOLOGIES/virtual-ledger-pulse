
-- =====================================================
-- Phase 2: Fix sub-penny floating point drift in 2 bank accounts
-- BLYNK INDUSIND: drift = +0.0002 (tracked > calculated → needs tiny INCOME)
-- IPAY DIGI: drift = -0.00000000004 (negligible, fix tracked balance)
-- =====================================================

-- Disable balance triggers for precision fix
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_update_bank_account_balance;

-- Fix BLYNK INDUSIND: add 0.0002 INCOME to bring calculated up
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, transaction_date, description, reference_number, category, related_account_name)
VALUES ('3cf3278c-5b13-442c-9c0d-0352874a2f0c', 'INCOME', 0.0002, '2026-03-09', 'Precision Fix - BLYNK INDUSIND', 'PRECISION-FIX-20260309', 'OPENING_BALANCE', 'System');

-- Fix IPAY DIGI: negligible drift, just round the tracked balance
UPDATE public.bank_accounts 
SET balance = 69242.61, updated_at = now()
WHERE id = '4a08c92a-a814-4318-a450-ffa2f294ea1c';

-- Re-enable triggers
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_update_bank_account_balance;
