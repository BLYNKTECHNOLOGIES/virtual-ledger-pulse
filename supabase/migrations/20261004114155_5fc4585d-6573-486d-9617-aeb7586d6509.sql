ALTER TABLE public.hr_payroll_input_additions ADD COLUMN IF NOT EXISTS push_channel text;
ALTER TABLE public.hr_payroll_input_deductions ADD COLUMN IF NOT EXISTS push_channel text;
ALTER TABLE public.hr_payroll_input_deductions ADD COLUMN IF NOT EXISTS razorpay_label text;