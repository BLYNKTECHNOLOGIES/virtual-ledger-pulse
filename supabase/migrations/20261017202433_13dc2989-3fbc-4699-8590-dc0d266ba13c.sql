-- JT1b: give ats_job_templates the same grants as the other ATS tables. Signed-in users read and write only
-- through RLS (SELECT, INSERT, UPDATE, DELETE); the TRUNCATE, REFERENCES and TRIGGER they got by default are removed.
REVOKE ALL ON public.ats_job_templates FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_job_templates TO authenticated;