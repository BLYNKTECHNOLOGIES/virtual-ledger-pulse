ALTER TABLE public.hr_employee_documents
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_hidden
  ON public.hr_employee_documents (employee_id) WHERE is_hidden = false;