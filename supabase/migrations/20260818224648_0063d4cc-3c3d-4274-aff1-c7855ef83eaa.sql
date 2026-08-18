ALTER TABLE public.hr_deposit_transactions
  DROP CONSTRAINT IF EXISTS hr_deposit_transactions_transaction_type_check;

ALTER TABLE public.hr_deposit_transactions
  ADD CONSTRAINT hr_deposit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'collection','penalty_deduction','replenishment','ff_refund',
    'initiated','modified','paused','resumed','completed','refund','ff_settlement'
  ]));