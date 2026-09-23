ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS profile_image_source_doc_id uuid;