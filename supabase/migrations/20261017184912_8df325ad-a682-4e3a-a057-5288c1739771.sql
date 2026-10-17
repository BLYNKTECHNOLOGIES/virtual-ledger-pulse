-- JT1: per-designation job posting templates for the ATS.
-- The default template for each designation ships with the app (src/lib/ats/jobTemplateDefaults.ts,
-- written from the JD Compendium v4.2). A row here is HR's saved version for that designation and
-- replaces the default; deleting the row brings the default back. hr_notes is for HR only and is
-- never copied to ats_jobs or the careers feed.
CREATE TABLE public.ats_job_templates (
  position_id uuid PRIMARY KEY REFERENCES public.positions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  summary text,
  description text,
  requirements text,
  benefits text,
  hr_notes text,
  employment_type text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type = ANY (ARRAY['full_time','part_time','contract','internship','trainee'])),
  experience_min_years numeric CHECK (experience_min_years IS NULL OR (experience_min_years >= 0 AND experience_min_years <= 50)),
  experience_max_years numeric CHECK (experience_max_years IS NULL OR (experience_max_years >= 0 AND experience_max_years <= 50)),
  salary_min numeric CHECK (salary_min IS NULL OR salary_min >= 0),
  salary_max numeric CHECK (salary_max IS NULL OR salary_max >= 0),
  salary_period text NOT NULL DEFAULT 'monthly' CHECK (salary_period = ANY (ARRAY['monthly','annual'])),
  show_salary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_name text,
  CONSTRAINT ats_job_templates_experience_range CHECK (experience_min_years IS NULL OR experience_max_years IS NULL OR experience_max_years >= experience_min_years),
  CONSTRAINT ats_job_templates_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min),
  CONSTRAINT ats_job_templates_summary_length CHECK (summary IS NULL OR char_length(summary) <= 500),
  CONSTRAINT ats_job_templates_text_length CHECK (
    coalesce(char_length(description), 0) <= 20000 AND coalesce(char_length(requirements), 0) <= 20000
    AND coalesce(char_length(benefits), 0) <= 20000 AND coalesce(char_length(hr_notes), 0) <= 20000)
);

COMMENT ON TABLE public.ats_job_templates IS
  'HR''s saved job posting template per designation. Replaces the app''s built-in default (JD Compendium v4.2) for that designation; deleting the row restores the default. hr_notes is HR-only.';

CREATE OR REPLACE FUNCTION public.ats_job_templates_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  NEW.updated_by_name := public.ats_actor_name(auth.uid());
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := auth.uid();
    NEW.created_by_name := NEW.updated_by_name;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.created_by_name := OLD.created_by_name;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ats_job_templates_touch
  BEFORE INSERT OR UPDATE ON public.ats_job_templates
  FOR EACH ROW EXECUTE FUNCTION public.ats_job_templates_touch();

ALTER TABLE public.ats_job_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY ats_job_templates_select ON public.ats_job_templates
  FOR SELECT TO authenticated USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_job_templates_insert ON public.ats_job_templates
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.ats_can_manage_settings()));
CREATE POLICY ats_job_templates_update ON public.ats_job_templates
  FOR UPDATE TO authenticated USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));
CREATE POLICY ats_job_templates_delete ON public.ats_job_templates
  FOR DELETE TO authenticated USING ((SELECT public.ats_can_manage_settings()));

REVOKE ALL ON public.ats_job_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_job_templates TO authenticated;
GRANT ALL ON public.ats_job_templates TO service_role;