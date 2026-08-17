ALTER TABLE public.legal_actions
  ADD COLUMN IF NOT EXISTS bank_case_id uuid REFERENCES public.bank_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regulatory_case_id uuid REFERENCES public.compliance_regulatory_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

CREATE INDEX IF NOT EXISTS idx_legal_actions_bank_case_id ON public.legal_actions(bank_case_id);
CREATE INDEX IF NOT EXISTS idx_legal_actions_regulatory_case_id ON public.legal_actions(regulatory_case_id);