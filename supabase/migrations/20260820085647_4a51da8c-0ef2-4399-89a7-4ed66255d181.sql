ALTER TABLE public.bank_cases
  ADD COLUMN IF NOT EXISTS lien_state text,
  ADD COLUMN IF NOT EXISTS lien_city text;