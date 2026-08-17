ALTER TABLE public.report_email_configs DROP CONSTRAINT IF EXISTS report_email_configs_variant_check;
ALTER TABLE public.report_email_configs ADD CONSTRAINT report_email_configs_variant_check
  CHECK (variant IN ('profit','operations','kyc_rm','compliance'));