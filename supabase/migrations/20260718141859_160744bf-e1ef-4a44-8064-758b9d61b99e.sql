CREATE OR REPLACE FUNCTION public.trg_flag_razorpay_pending_on_identity_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
     OR (NEW.email IS DISTINCT FROM OLD.email)
     OR (NEW.phone IS DISTINCT FROM OLD.phone)
     OR (NEW.pan_number IS DISTINCT FROM OLD.pan_number)
     OR (NEW.dob IS DISTINCT FROM OLD.dob)
     OR (NEW.gender IS DISTINCT FROM OLD.gender)
  THEN
    UPDATE public.hr_razorpay_employee_map
       SET sync_status = 'drift'::hr_razorpay_sync_status,
           last_error = 'ERP identity edited — pending push to Razorpay',
           updated_at = now()
     WHERE hr_employee_id = NEW.id
       AND sync_status <> 'error'::hr_razorpay_sync_status;
  END IF;
  RETURN NEW;
END;
$function$;