CREATE OR REPLACE FUNCTION public.hr_align_salary_structures_to_razorpay(p_employee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_before numeric;
  v_after numeric;
  v_fixed int := 0;
  v_checked int := 0;
  v_details jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (m.hr_employee_id)
           m.hr_employee_id AS emp_id,
           (m.last_pull_snapshot->'__salary'->>'annual_ctc')::numeric AS ctc,
           m.last_pull_snapshot->>'name' AS nm
      FROM public.hr_razorpay_employee_map m
     WHERE m.hr_employee_id IS NOT NULL
       AND (p_employee_id IS NULL OR m.hr_employee_id = p_employee_id)
       AND (m.last_pull_snapshot->'__salary'->>'annual_ctc') IS NOT NULL
     ORDER BY m.hr_employee_id, m.last_pulled_at DESC NULLS LAST
  LOOP
    CONTINUE WHEN r.ctc IS NULL OR r.ctc <= 0;

    SELECT COALESCE(sum(amount), 0) INTO v_before
      FROM public.hr_employee_salary_structures
     WHERE employee_id = r.emp_id AND is_active = true;

    v_checked := v_checked + 1;

    -- Mirrored RazorpayX rows carry rupee amounts; the legacy writer flagged
    -- them as percentages which makes every downstream reader guess.
    UPDATE public.hr_employee_salary_structures
       SET is_percentage = false, updated_at = now()
     WHERE employee_id = r.emp_id AND is_active = true
       AND is_percentage = true AND amount > 100;

    -- RazorpayX is the payroll authority: components must sum to its CTC.
    IF abs(v_before - r.ctc) > 1 THEN
      PERFORM public._rescale_employee_salary_structure(r.emp_id, r.ctc);
      v_fixed := v_fixed + 1;
    END IF;

    SELECT COALESCE(sum(amount), 0) INTO v_after
      FROM public.hr_employee_salary_structures
     WHERE employee_id = r.emp_id AND is_active = true;

    UPDATE public.hr_employees
       SET total_salary = r.ctc
     WHERE id = r.emp_id
       AND COALESCE(total_salary, 0) <> r.ctc;

    IF abs(v_before - r.ctc) > 1 THEN
      v_details := v_details || jsonb_build_object(
        'employee_id', r.emp_id, 'name', r.nm,
        'razorpay_annual_ctc', r.ctc, 'before', v_before, 'after', v_after);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'realigned', v_fixed, 'details', v_details);
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_align_salary_structures_to_razorpay(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hr_align_salary_structures_to_razorpay(uuid) TO service_role;

-- Root-cause guard: every fresh RazorpayX pull re-anchors the mirror.
CREATE OR REPLACE FUNCTION public.trg_align_structures_after_razorpay_pull()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.hr_employee_id IS NOT NULL
     AND (NEW.last_pull_snapshot->'__salary'->>'annual_ctc') IS NOT NULL
     AND (NEW.last_pull_snapshot->'__salary'->>'annual_ctc')
         IS DISTINCT FROM (OLD.last_pull_snapshot->'__salary'->>'annual_ctc') THEN
    PERFORM public.hr_align_salary_structures_to_razorpay(NEW.hr_employee_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS align_structures_after_razorpay_pull ON public.hr_razorpay_employee_map;
CREATE TRIGGER align_structures_after_razorpay_pull
AFTER UPDATE OF last_pull_snapshot ON public.hr_razorpay_employee_map
FOR EACH ROW EXECUTE FUNCTION public.trg_align_structures_after_razorpay_pull();

SELECT public.hr_align_salary_structures_to_razorpay(NULL);