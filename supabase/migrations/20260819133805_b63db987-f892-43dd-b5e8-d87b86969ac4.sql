ALTER TABLE public.hr_documents_issued
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS employee_document_id uuid;

DROP POLICY IF EXISTS "HR staff delete issued docs" ON public.hr_documents_issued;
CREATE POLICY "HR staff delete issued docs"
ON public.hr_documents_issued FOR DELETE
TO authenticated
USING (public.hr_is_hr_staff(auth.uid()));