CREATE OR REPLACE FUNCTION public.trg_flag_razorpay_pending_on_identity_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
     OR (NEW.email IS DISTINCT FROM OLD.email)
     OR (NEW.phone IS DISTINCT FROM OLD.phone)
     OR (NEW.pan_number IS DISTINCT FROM OLD.pan_number)
     OR (NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth)
     OR (NEW.gender IS DISTINCT FROM OLD.gender)
  THEN
    UPDATE public.hr_razorpay_employee_map
       SET sync_status = 'drift'::hr_razorpay_sync_status,
           last_error = 'ERP identity edited — pending push to Razorpay',
           updated_at = now()
     WHERE employee_id = NEW.id
       AND sync_status <> 'error'::hr_razorpay_sync_status;
  END IF;
  RETURN NEW;
END;
$$;