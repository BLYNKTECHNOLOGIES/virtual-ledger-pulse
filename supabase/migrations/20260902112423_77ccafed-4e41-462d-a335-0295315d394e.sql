ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text;

CREATE OR REPLACE FUNCTION public.set_lead_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
  END IF;

  IF NEW.created_by_name IS NULL OR btrim(NEW.created_by_name) = '' THEN
    IF NEW.created_by IS NOT NULL THEN
      SELECT NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
      INTO v_name
      FROM public.users u
      WHERE u.id = NEW.created_by;
      NEW.created_by_name := v_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_created_by ON public.leads;
CREATE TRIGGER trg_set_lead_created_by
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_lead_created_by();

CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by);