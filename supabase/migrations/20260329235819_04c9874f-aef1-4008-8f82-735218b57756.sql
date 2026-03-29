
-- Delete old New Regime brackets
DELETE FROM public.hr_tax_brackets WHERE filing_status_id = 'c09e6a86-0c4f-435a-b19d-fcd128720412';

-- Insert FY 2025-26 New Regime brackets (7 slabs)
INSERT INTO public.hr_tax_brackets (filing_status_id, min_income, max_income, tax_rate, sort_order, description) VALUES
('c09e6a86-0c4f-435a-b19d-fcd128720412', 0, 400000, 0, 1, 'Nil tax up to ₹4L'),
('c09e6a86-0c4f-435a-b19d-fcd128720412', 400000, 800000, 5, 2, '5% on ₹4L–₹8L'),
('c09e6a86-0c4f-435a-b19d-fcd128720412', 800000, 1200000, 10, 3, '10% on ₹8L–₹12L'),
('c09e6a86-0c4f-435a-b19d-fcd128720412', 1200000, 1600000, 15, 4, '15% on ₹12L–₹16L'),
('c09e6a86-0c4f-435a-b19d-fcd128720412', 1600000, 2000000, 20, 5, '20% on ₹16L–₹20L'),
('c09e6a86-0c4f-435a-b19d-fcd128720412', 2000000, 2400000, 25, 6, '25% on ₹20L–₹24L'),
('c09e6a86-0c4f-435a-b19d-fcd128720412', 2400000, NULL, 30, 7, '30% above ₹24L');

-- Update filing status name
UPDATE public.hr_filing_statuses SET name = 'New Regime (FY 2025-26)' WHERE id = 'c09e6a86-0c4f-435a-b19d-fcd128720412';

-- Update compute_annual_tax to include Section 87A rebate
CREATE OR REPLACE FUNCTION public.compute_annual_tax(
  p_taxable_income NUMERIC,
  p_filing_status_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax NUMERIC := 0;
  v_bracket RECORD;
  v_taxable_in_bracket NUMERIC;
  v_fs_name TEXT;
BEGIN
  IF p_taxable_income <= 0 OR p_filing_status_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate tax using progressive brackets
  FOR v_bracket IN
    SELECT min_income, COALESCE(max_income, 999999999999) AS max_income, tax_rate
    FROM public.hr_tax_brackets
    WHERE filing_status_id = p_filing_status_id
    ORDER BY sort_order
  LOOP
    IF p_taxable_income > v_bracket.min_income THEN
      v_taxable_in_bracket := LEAST(p_taxable_income, v_bracket.max_income) - v_bracket.min_income;
      v_tax := v_tax + (v_taxable_in_bracket * v_bracket.tax_rate / 100);
    END IF;
  END LOOP;

  -- Apply Section 87A rebate for New Regime: if taxable income <= 12,00,000, tax = 0
  SELECT name INTO v_fs_name FROM public.hr_filing_statuses WHERE id = p_filing_status_id;
  IF v_fs_name ILIKE '%new regime%' AND p_taxable_income <= 1200000 THEN
    v_tax := 0;
  END IF;

  RETURN ROUND(v_tax, 2);
END;
$$;
