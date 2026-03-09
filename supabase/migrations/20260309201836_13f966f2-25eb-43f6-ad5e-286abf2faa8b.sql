
-- Disable only user-defined triggers on bank_transactions
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_check_bank_balance;
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_update_bank_account_balance;
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_lock_balance_after_transaction;

-- Insert opening balance adjustment entries (no triggers fire)
INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, transaction_date, description, reference_number, category, related_account_name)
VALUES
('dc8dd7cd-9019-4e4a-8e99-9b048cded62b', 'EXPENSE', 662193.38, '2026-03-09', 'Opening Balance Adjustment - ASEC INDUSIND', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('3cf3278c-5b13-442c-9c0d-0352874a2f0c', 'EXPENSE', 756915.1214, '2026-03-09', 'Opening Balance Adjustment - BLYNK INDUSIND BANK', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('df678cad-0b88-4bc9-b7a6-429ebd6b9604', 'EXPENSE', 932260.6865, '2026-03-09', 'Opening Balance Adjustment - ICICI BLYNK', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('4a08c92a-a814-4318-a450-ffa2f294ea1c', 'EXPENSE', 30260.2598, '2026-03-09', 'Opening Balance Adjustment - IPAY DIGI', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('4b75c901-2d0e-4449-a033-9ce9368525a9', 'INCOME', 110000, '2026-03-09', 'Opening Balance Adjustment - CASH', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('3482a587-0bd6-47eb-8b43-ada4ce4c776d', 'INCOME', 155789.00, '2026-03-09', 'Opening Balance Adjustment - CREDIT ACCOUNT', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('24465cfe-e685-4e9c-b441-a3adcc203768', 'INCOME', 203808.59, '2026-03-09', 'Opening Balance Adjustment - IDBI', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('27f7cccd-e474-426a-964c-e7ceccfc5fa2', 'INCOME', 310897.46, '2026-03-09', 'Opening Balance Adjustment - INDUSIND SS', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('2a675ce6-2d65-4e60-a41a-28e07efcf626', 'INCOME', 187593.93, '2026-03-09', 'Opening Balance Adjustment - PSB BLYNK', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('45025df5-821a-4388-a6d4-bb685251946e', 'INCOME', 18395, '2026-03-09', 'Opening Balance Adjustment - UNION ABHISHEK', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('b72c6e2f-3f71-4a5e-8150-96a246ff5638', 'INCOME', 96795, '2026-03-09', 'Opening Balance Adjustment - UNION BLYNK', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('f1fb9834-7a02-48fd-a901-32ed4347b095', 'INCOME', 295739.24, '2026-03-09', 'Opening Balance Adjustment - VERTEX INDUSIND', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('b240b1ad-d229-458f-80a2-8a5d1b132c23', 'INCOME', 5276, '2026-03-09', 'Opening Balance Adjustment - PNB', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System'),
('bb859717-4cd8-4260-9ab3-0eb1c0120c18', 'INCOME', 2607.26, '2026-03-09', 'Opening Balance Adjustment - OBOPAY', 'OB-ADJ-20260309', 'OPENING_BALANCE', 'System');

-- Re-enable triggers
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_check_bank_balance;
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_update_bank_account_balance;
ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_lock_balance_after_transaction;
