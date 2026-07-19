
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS xpayroll_handles_salary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS xpayroll_handles_contractors boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_transfer_method text NOT NULL DEFAULT 'NEFT'
    CHECK (bank_transfer_method IN ('NEFT','IMPS','RTGS')),
  ADD COLUMN IF NOT EXISTS bank_verification_upload_proof boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_verification_auto_approve_name_match boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_files_salary_tds boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_files_nonsalary_tds boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_files_pf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS compliance_files_esi boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS compliance_files_pt boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pf_include_employer_in_ctc boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pf_include_admin_edli_in_ctc boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pf_wages_basic_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pf_wage_cap_15000 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS esi_include_employer_in_ctc boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS esi_include_additions_in_wages boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_settings_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS compliance_settings_updated_by uuid;

COMMENT ON COLUMN public.hr_razorpay_settings.xpayroll_handles_salary IS
  'Mirror of RazorpayX Payroll Setting: "Salary transfers to employees'' bank accounts".';
COMMENT ON COLUMN public.hr_razorpay_settings.xpayroll_handles_contractors IS
  'Mirror of RazorpayX Payroll Setting: "Payments to contractors, vendors, consultants etc.".';
COMMENT ON COLUMN public.hr_razorpay_settings.bank_transfer_method IS
  'Mirror of RazorpayX Payroll Setting: "Preferred method for bank transfer" (NEFT/IMPS/RTGS).';
COMMENT ON COLUMN public.hr_razorpay_settings.bank_verification_upload_proof IS
  'Mirror of RazorpayX Bank Account Verification: "Upload proof for verification".';
COMMENT ON COLUMN public.hr_razorpay_settings.bank_verification_auto_approve_name_match IS
  'Mirror of RazorpayX Bank Account Verification: "Auto-approve if the account holder name matches the employee name".';
COMMENT ON COLUMN public.hr_razorpay_settings.compliance_files_salary_tds IS
  'Mirror of Compliance Payments: "Salary TDS payments (if applicable)".';
COMMENT ON COLUMN public.hr_razorpay_settings.compliance_files_nonsalary_tds IS
  'Mirror of Compliance Payments: "Non-salary TDS payments (for contractors)".';
COMMENT ON COLUMN public.hr_razorpay_settings.compliance_files_pf IS
  'Mirror of Compliance Payments: "PF payments and filing".';
COMMENT ON COLUMN public.hr_razorpay_settings.compliance_files_esi IS
  'Mirror of Compliance Payments: "ESI payments and filing".';
COMMENT ON COLUMN public.hr_razorpay_settings.compliance_files_pt IS
  'Mirror of Compliance Payments: "Professional tax payments and filing".';
COMMENT ON COLUMN public.hr_razorpay_settings.pf_include_employer_in_ctc IS
  'Mirror of PF Settings: "Include employer contribution to PF in employee CTC".';
COMMENT ON COLUMN public.hr_razorpay_settings.pf_include_admin_edli_in_ctc IS
  'Mirror of PF Settings: "Include PF edli + admin charges in employee CTC".';
COMMENT ON COLUMN public.hr_razorpay_settings.pf_wages_basic_only IS
  'Mirror of PF Settings: "Use only basic salary for calculating PF".';
COMMENT ON COLUMN public.hr_razorpay_settings.pf_wage_cap_15000 IS
  'Mirror of PF Settings: "Use PF limit of ₹15,000 while calculating contributions".';
COMMENT ON COLUMN public.hr_razorpay_settings.esi_include_employer_in_ctc IS
  'Mirror of ESI Settings: "Include employer contribution to ESI in employee CTC".';
COMMENT ON COLUMN public.hr_razorpay_settings.esi_include_additions_in_wages IS
  'Mirror of ESI Settings: "Include payroll additions and one-time payments to ESI wages".';

-- Seed the compliance timestamp on the existing singleton row so the UI shows
-- "last mirrored" from now instead of NULL for the initial reflect.
UPDATE public.hr_razorpay_settings
SET compliance_settings_updated_at = COALESCE(compliance_settings_updated_at, now())
WHERE is_singleton = true;
