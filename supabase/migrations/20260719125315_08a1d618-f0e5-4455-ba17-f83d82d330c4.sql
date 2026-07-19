ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS pf_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esi_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pt_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_structure_pct JSONB;

COMMENT ON COLUMN public.hr_employees.pf_enabled IS 'RazorpayX per-employee PF enrollment. Shadow engine gates PF computation on this.';
COMMENT ON COLUMN public.hr_employees.esi_enabled IS 'RazorpayX per-employee ESI enrollment. Combined with the ≤21k gate.';
COMMENT ON COLUMN public.hr_employees.pt_enabled IS 'RazorpayX per-employee PT enrollment. Defaults ON; disable per state exemptions.';
COMMENT ON COLUMN public.hr_employees.custom_structure_pct IS 'Per-employee override of the default 50/25/15/10 Basic/HRA/Special/LTA split. Shape: {"basic":50,"hra":25,"special":15,"lta":10}. Null = use RazorpayX default from hr_razorpay_settings.';

-- LWF explicitly off (user directive)
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS compliance_files_lwf BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hr_razorpay_settings.compliance_files_lwf IS 'LWF filing. Locked OFF by directive — was deducted once by mistake in Jun-26; never re-enable without approval.';