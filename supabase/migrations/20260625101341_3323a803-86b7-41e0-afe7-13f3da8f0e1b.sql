CREATE OR REPLACE FUNCTION public.validate_conversion_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow approved_by to be detached (NULL) when the audit name is preserved,
  -- e.g. when the approving user is deleted via delete_user_with_cleanup.
  IF NEW.status = 'APPROVED'
     AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL)
     AND COALESCE(NULLIF(TRIM(NEW.approved_by_name), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'approved_by and approved_at are required when status is APPROVED';
  END IF;

  IF NEW.status = 'REJECTED'
     AND NEW.rejected_by IS NULL
     AND COALESCE(NULLIF(TRIM(NEW.rejected_by_name), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'rejected_by is required when status is REJECTED';
  END IF;

  RETURN NEW;
END;
$function$;