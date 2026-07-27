CREATE OR REPLACE FUNCTION public.hr_auto_assign_default_weekly_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern_id uuid;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.hr_employee_weekly_off WHERE employee_id = NEW.id AND is_current) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_pattern_id
  FROM public.hr_weekly_off_patterns
  WHERE is_active AND name ILIKE 'Standard - Sunday Off'
  ORDER BY created_at NULLS LAST
  LIMIT 1;

  IF v_pattern_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hr_employee_weekly_off (employee_id, pattern_id, is_current)
  VALUES (NEW.id, v_pattern_id, true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_auto_assign_default_weekly_off ON public.hr_employees;
CREATE TRIGGER trg_hr_auto_assign_default_weekly_off
AFTER INSERT OR UPDATE OF is_active ON public.hr_employees
FOR EACH ROW
EXECUTE FUNCTION public.hr_auto_assign_default_weekly_off();