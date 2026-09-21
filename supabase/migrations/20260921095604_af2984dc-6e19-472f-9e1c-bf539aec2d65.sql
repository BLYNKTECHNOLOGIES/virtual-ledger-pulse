CREATE TABLE IF NOT EXISTS public.hr_job_descriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_title TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  section TEXT,
  reports_to TEXT,
  page_from INTEGER,
  page_to INTEGER,
  storage_path TEXT NOT NULL,
  source_document TEXT DEFAULT 'Blynk Job Description Compendium (BVT/HR/JD/2026/COMP-01)',
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_job_descriptions_position ON public.hr_job_descriptions(position_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_job_descriptions TO authenticated;
GRANT ALL ON public.hr_job_descriptions TO service_role;

ALTER TABLE public.hr_job_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jd_view_authenticated" ON public.hr_job_descriptions
FOR SELECT TO authenticated USING (true);

CREATE POLICY "jd_manage_hr" ON public.hr_job_descriptions
FOR ALL TO authenticated
USING (public.hr_is_hr_staff(auth.uid()))
WITH CHECK (public.hr_is_hr_staff(auth.uid()));

CREATE TRIGGER trg_hr_job_descriptions_updated_at
BEFORE UPDATE ON public.hr_job_descriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "jd_files_read_authenticated" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'job-descriptions');

CREATE POLICY "jd_files_manage_hr" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'job-descriptions' AND public.hr_is_hr_staff(auth.uid()))
WITH CHECK (bucket_id = 'job-descriptions' AND public.hr_is_hr_staff(auth.uid()));