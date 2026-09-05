CREATE OR REPLACE FUNCTION public.hr_set_deduction_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.deduct_from IS NULL OR NEW.deduct_from = 'net' THEN
    IF NEW.source = 'training_ctc_adjustment'
       OR NEW.label ILIKE '%CTC Revision%'
       OR NEW.label ILIKE '%Part-Month%'
       OR NEW.label ILIKE '%normalis%'
       OR NEW.label ILIKE '%normaliz%' THEN
      NEW.deduct_from := 'gross';
    ELSE
      NEW.deduct_from := COALESCE(NEW.deduct_from, 'net');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_set_deduction_target ON public.hr_payroll_input_deductions;
CREATE TRIGGER trg_hr_set_deduction_target
BEFORE INSERT ON public.hr_payroll_input_deductions
FOR EACH ROW EXECUTE FUNCTION public.hr_set_deduction_target();