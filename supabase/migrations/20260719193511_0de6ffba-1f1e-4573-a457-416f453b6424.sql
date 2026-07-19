CREATE OR REPLACE FUNCTION public.hr_next_razorpay_employee_id()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  max_rzp integer := 0;
  max_badge integer := 0;
  max_onboarding integer := 0;
  max_user_badge integer := 0;
  max_essl_attempt integer := 0;
BEGIN
  SELECT COALESCE(MAX((razorpay_employee_id)::int), 0) INTO max_rzp
  FROM public.hr_razorpay_employee_map
  WHERE razorpay_employee_id ~ '^[0-9]+$';

  SELECT COALESCE(MAX((badge_id)::int), 0) INTO max_badge
  FROM public.hr_employees
  WHERE badge_id ~ '^[0-9]+$';

  SELECT COALESCE(MAX((essl_badge_id)::int), 0) INTO max_onboarding
  FROM public.hr_employee_onboarding
  WHERE essl_badge_id ~ '^[0-9]+$';

  SELECT COALESCE(MAX((badge_id)::int), 0) INTO max_user_badge
  FROM public.users
  WHERE badge_id ~ '^[0-9]+$';

  -- Treat onboarding-created biometric identity attempts as consumed IDs even
  -- if the operator later resets the onboarding row or cancels the queued push.
  -- This prevents a failed/deleted Razorpay create for ID 72 from immediately
  -- reappearing as the next "fresh" reservation.
  SELECT COALESCE(MAX((pin)::int), 0) INTO max_essl_attempt
  FROM public.hr_essl_pushback_log
  WHERE pin ~ '^[0-9]+$'
    AND triggered_from = 'onboarding_stage5'
    AND kind = 'identity';

  RETURN (GREATEST(max_rzp, max_badge, max_onboarding, max_user_badge, max_essl_attempt) + 1)::text;
END;
$function$;