CREATE OR REPLACE FUNCTION public.hr_passport_photo_sync_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NEW.document_type IS DISTINCT FROM 'passport_photo' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.file_url IS NOT DISTINCT FROM OLD.file_url THEN
    RETURN NEW;
  END IF;

  SELECT secret_value INTO v_secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';
  IF v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/employee-photo-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-scheduler-secret', v_secret),
    body := jsonb_build_object('employee_id', NEW.employee_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_passport_photo_sync ON public.hr_employee_documents;
CREATE TRIGGER trg_hr_passport_photo_sync
AFTER INSERT OR UPDATE OF file_url, document_type ON public.hr_employee_documents
FOR EACH ROW EXECUTE FUNCTION public.hr_passport_photo_sync_notify();

REVOKE EXECUTE ON FUNCTION public.hr_passport_photo_sync_notify() FROM anon, authenticated;