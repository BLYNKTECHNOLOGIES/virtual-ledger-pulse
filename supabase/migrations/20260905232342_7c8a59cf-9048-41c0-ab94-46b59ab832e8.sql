ALTER TABLE public.hr_payroll_input_deductions
  ADD COLUMN IF NOT EXISTS deduct_from text NOT NULL DEFAULT 'net';

ALTER TABLE public.hr_payroll_input_deductions
  DROP CONSTRAINT IF EXISTS hr_payroll_input_deductions_deduct_from_chk;

ALTER TABLE public.hr_payroll_input_deductions
  ADD CONSTRAINT hr_payroll_input_deductions_deduct_from_chk
  CHECK (deduct_from IN ('net','gross'));

UPDATE public.hr_payroll_input_deductions
   SET deduct_from = 'gross'
 WHERE deduct_from <> 'gross'
   AND (source = 'training_ctc_adjustment'
        OR label ILIKE '%CTC Revision%'
        OR label ILIKE '%Part-Month%'
        OR label ILIKE '%normalis%'
        OR label ILIKE '%normaliz%');