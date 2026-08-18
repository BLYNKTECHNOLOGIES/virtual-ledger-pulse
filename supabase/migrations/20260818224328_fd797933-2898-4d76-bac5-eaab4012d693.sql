ALTER TABLE public.hr_employee_deposits
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withheld_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withheld_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_period_month date,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none';

ALTER TABLE public.hr_employee_deposits
  DROP CONSTRAINT IF EXISTS hr_employee_deposits_refund_status_chk;

ALTER TABLE public.hr_employee_deposits
  ADD CONSTRAINT hr_employee_deposits_refund_status_chk
  CHECK (refund_status IN ('none','refunded'));

UPDATE public.hr_employee_deposits
SET refund_status = 'refunded',
    refund_amount = COALESCE(collected_amount, 0),
    refunded_at = COALESCE(settled_at, now())
WHERE is_recovered = true AND refund_status = 'none';