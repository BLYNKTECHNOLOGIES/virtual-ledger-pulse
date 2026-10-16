ALTER TABLE public.ats_jobs ADD COLUMN IF NOT EXISTS application_form jsonb;
ALTER TABLE public.ats_applications ADD COLUMN IF NOT EXISTS form_snapshot jsonb, ADD COLUMN IF NOT EXISTS knockout_flags text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.ats_validate_application_form(f jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF f IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(f) <> 'object' THEN RAISE EXCEPTION 'Application form must be an object'; END IF;
  IF f ? 'fields' AND jsonb_typeof(f->'fields') <> 'object' THEN RAISE EXCEPTION 'Application form fields must be an object'; END IF;
  IF f ? 'questions' AND jsonb_typeof(f->'questions') <> 'array' THEN RAISE EXCEPTION 'Application form questions must be a list'; END IF;
  IF coalesce(f->'fields'->>'phone','required') = 'hidden' AND coalesce(f->'fields'->>'email','required') = 'hidden' THEN
    RAISE EXCEPTION 'Phone and email cannot both be hidden';
  END IF;
  IF jsonb_array_length(coalesce(f->'questions','[]'::jsonb)) > 30 THEN RAISE EXCEPTION 'At most 30 custom questions'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ats_jobs_form_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public.ats_validate_application_form(NEW.application_form); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS ats_jobs_form_check ON public.ats_jobs;
CREATE TRIGGER ats_jobs_form_check BEFORE INSERT OR UPDATE OF application_form ON public.ats_jobs FOR EACH ROW EXECUTE FUNCTION public.ats_jobs_form_check();

CREATE TABLE public.ats_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  form jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_form_templates TO authenticated;
GRANT ALL ON public.ats_form_templates TO service_role;
ALTER TABLE public.ats_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ats_form_templates_select ON public.ats_form_templates FOR SELECT TO authenticated USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_form_templates_insert ON public.ats_form_templates FOR INSERT TO authenticated WITH CHECK ((SELECT public.ats_can_manage_settings()));
CREATE POLICY ats_form_templates_update ON public.ats_form_templates FOR UPDATE TO authenticated USING ((SELECT public.ats_can_manage_settings())) WITH CHECK ((SELECT public.ats_can_manage_settings()));
CREATE POLICY ats_form_templates_delete ON public.ats_form_templates FOR DELETE TO authenticated USING ((SELECT public.ats_can_manage_settings()));

CREATE OR REPLACE FUNCTION public.ats_form_templates_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); PERFORM public.ats_validate_application_form(NEW.form); RETURN NEW; END $$;
CREATE TRIGGER ats_form_templates_touch BEFORE INSERT OR UPDATE ON public.ats_form_templates FOR EACH ROW EXECUTE FUNCTION public.ats_form_templates_touch();