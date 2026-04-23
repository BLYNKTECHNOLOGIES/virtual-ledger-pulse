-- Make related_transaction_id FK deferrable so create_bank_transfer can insert
-- both legs cross-referencing each other within a single transaction without
-- needing a forbidden post-insert UPDATE.

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_related_transaction_id_fkey;

ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_related_transaction_id_fkey
  FOREIGN KEY (related_transaction_id)
  REFERENCES public.bank_transactions(id)
  DEFERRABLE INITIALLY DEFERRED;

-- Also defer the reverses_transaction_id FK for symmetry / future-proofing reversals
ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_reverses_transaction_id_fkey;

ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_reverses_transaction_id_fkey
  FOREIGN KEY (reverses_transaction_id)
  REFERENCES public.bank_transactions(id)
  DEFERRABLE INITIALLY DEFERRED;