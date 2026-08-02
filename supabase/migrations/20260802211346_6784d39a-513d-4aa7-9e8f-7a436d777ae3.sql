CREATE OR REPLACE FUNCTION public._rescale_employee_salary_structure(
  p_employee_id uuid,
  p_new_total   numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_total numeric;
  v_count     int;
  v_ratio     numeric;
  v_basic     uuid;
  v_hra       uuid;
  v_special   uuid;
  v_lta       uuid;
BEGIN
  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION 'Rescale requires a non-negative new total';
  END IF;

  SELECT COALESCE(SUM(amount),0), COUNT(*)
    INTO v_old_total, v_count
  FROM public.hr_employee_salary_structures
  WHERE employee_id = p_employee_id AND is_active = true;

  -- No mirrored structure yet (employee never pulled from RazorpayX): seed the
  -- RazorpayX default breakup instead of blocking the revision.
  IF v_count = 0 THEN
    SELECT id INTO v_basic   FROM public.hr_salary_components WHERE name = 'Basic' AND is_active LIMIT 1;
    SELECT id INTO v_hra     FROM public.hr_salary_components WHERE name = 'HRA' AND is_active LIMIT 1;
    SELECT id INTO v_special FROM public.hr_salary_components WHERE name = 'Special Allowance' AND is_active LIMIT 1;
    SELECT id INTO v_lta     FROM public.hr_salary_components WHERE name = 'LTA' AND is_active LIMIT 1;

    IF v_basic IS NULL OR v_hra IS NULL OR v_special IS NULL OR v_lta IS NULL THEN
      RAISE EXCEPTION 'Cannot seed default salary structure: base components (Basic/HRA/Special Allowance/LTA) are missing';
    END IF;

    INSERT INTO public.hr_employee_salary_structures
      (employee_id, component_id, amount, is_percentage, is_active, source, effective_from)
    VALUES
      (p_employee_id, v_basic,   ROUND(p_new_total * 0.50, 2), false, true, 'seeded_default', CURRENT_DATE),
      (p_employee_id, v_hra,     ROUND(p_new_total * 0.25, 2), false, true, 'seeded_default', CURRENT_DATE),
      (p_employee_id, v_special, ROUND(p_new_total * 0.15, 2), false, true, 'seeded_default', CURRENT_DATE),
      (p_employee_id, v_lta,     p_new_total
         - ROUND(p_new_total * 0.50, 2) - ROUND(p_new_total * 0.25, 2) - ROUND(p_new_total * 0.15, 2),
       false, true, 'seeded_default', CURRENT_DATE);
    RETURN;
  END IF;

  IF v_old_total = 0 THEN
    UPDATE public.hr_employee_salary_structures s
       SET amount = p_new_total,
           updated_at = now()
     WHERE s.id = (
        SELECT id FROM public.hr_employee_salary_structures
         WHERE employee_id = p_employee_id AND is_active = true
         ORDER BY created_at ASC LIMIT 1
     );
    UPDATE public.hr_employee_salary_structures
       SET amount = 0, updated_at = now()
     WHERE employee_id = p_employee_id
       AND is_active = true
       AND id <> (
         SELECT id FROM public.hr_employee_salary_structures
          WHERE employee_id = p_employee_id AND is_active = true
          ORDER BY created_at ASC LIMIT 1
       );
    RETURN;
  END IF;

  v_ratio := p_new_total / v_old_total;

  UPDATE public.hr_employee_salary_structures
     SET amount = ROUND(amount * v_ratio, 2),
         updated_at = now()
   WHERE employee_id = p_employee_id
     AND is_active = true;

  WITH sums AS (
    SELECT COALESCE(SUM(amount),0) AS s FROM public.hr_employee_salary_structures
     WHERE employee_id = p_employee_id AND is_active = true
  ), pick AS (
    SELECT id FROM public.hr_employee_salary_structures
     WHERE employee_id = p_employee_id AND is_active = true
     ORDER BY amount DESC, created_at ASC LIMIT 1
  )
  UPDATE public.hr_employee_salary_structures s
     SET amount = amount + (p_new_total - (SELECT s FROM sums)),
         updated_at = now()
   WHERE s.id = (SELECT id FROM pick);
END;
$$;