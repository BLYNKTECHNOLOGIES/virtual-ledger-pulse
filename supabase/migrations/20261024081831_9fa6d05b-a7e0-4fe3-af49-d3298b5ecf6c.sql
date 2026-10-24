ALTER TABLE public.hr_employee_onboarding ADD COLUMN prejoining jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.hr_prejoining_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; r jsonb; k text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.prejoining IS DISTINCT FROM OLD.prejoining AND auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR may manage pre-joining'; END IF;
 IF TG_OP='INSERT' AND NEW.prejoining <> '{}'::jsonb AND auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR may manage pre-joining'; END IF;
 IF TG_OP='UPDATE' AND NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' AND COALESCE((NEW.prejoining->>'enabled')::boolean,false) THEN
  IF NEW.prejoining->>'state' <> 'ready' OR NEW.prejoining->>'arrival_confirmed_at' IS NULL THEN RAISE EXCEPTION 'Pre-joining requires HR review and confirmed arrival'; END IF;
  IF NEW.date_of_joining IS NULL OR NEW.date_of_joining > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Actual joining cannot be confirmed before the joining date'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_prejoining_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hr_prejoining_guard BEFORE INSERT OR UPDATE ON public.hr_employee_onboarding FOR EACH ROW EXECUTE FUNCTION public.hr_prejoining_guard();
CREATE OR REPLACE FUNCTION public.hr_prejoining_employee_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record;
BEGIN
 IF NEW.is_active=true AND (TG_OP='INSERT' OR OLD.is_active IS DISTINCT FROM true) THEN
 FOR o IN SELECT id,prejoining,date_of_joining FROM public.hr_employee_onboarding WHERE employee_id=NEW.id AND COALESCE((prejoining->>'enabled')::boolean,false) LOOP
  IF o.prejoining->>'state' <> 'ready' OR o.prejoining->>'arrival_confirmed_at' IS NULL OR o.date_of_joining IS NULL OR o.date_of_joining > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Pre-joining requires HR review and confirmed arrival before activation'; END IF;
 END LOOP;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_prejoining_employee_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hr_prejoining_employee_guard BEFORE INSERT OR UPDATE OF is_active ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.hr_prejoining_employee_guard();