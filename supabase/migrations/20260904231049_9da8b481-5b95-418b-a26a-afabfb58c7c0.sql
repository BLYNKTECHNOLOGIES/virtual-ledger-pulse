DROP FUNCTION IF EXISTS public.hr_settle_compoff_credits(date, jsonb);

CREATE FUNCTION public.hr_settle_compoff_credits(
  p_period_month date,
  p_rows jsonb
)
RETURNS TABLE(out_employee_id uuid, settled_offset numeric, settled_encash numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  r record;
  c record;
  v_done_offset numeric;
  v_done_encash numeric;
BEGIN
  FOR r IN
    SELECT (x->>'employee_id')::uuid AS emp_id,
           GREATEST(COALESCE((x->>'offset_days')::numeric, 0), 0) AS offset_days,
           GREATEST(COALESCE((x->>'encash_days')::numeric, 0), 0) AS encash_days
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) x
  LOOP
    UPDATE public.hr_compoff_credits cc
       SET settled_period_month = NULL,
           settlement_outcome = NULL,
           updated_at = now()
     WHERE cc.employee_id = r.emp_id
       AND cc.settled_period_month = v_start
       AND cc.settlement_outcome IN ('offset_lop', 'encashed');

    v_done_offset := 0;
    v_done_encash := 0;

    FOR c IN
      SELECT cc.id, cc.credit_days
      FROM public.hr_compoff_credits cc
      WHERE cc.employee_id = r.emp_id
        AND cc.credit_date <= v_end
        AND cc.settled_period_month IS NULL
        AND COALESCE(cc.settlement_outcome, '') <> 'voided_no_attendance_evidence'
      ORDER BY cc.credit_date, cc.id
      FOR UPDATE
    LOOP
      IF v_done_offset < r.offset_days THEN
        UPDATE public.hr_compoff_credits cc
           SET settled_period_month = v_start,
               settlement_outcome = 'offset_lop',
               updated_at = now()
         WHERE cc.id = c.id;
        v_done_offset := v_done_offset + COALESCE(c.credit_days, 0);
      ELSIF v_done_encash < r.encash_days THEN
        UPDATE public.hr_compoff_credits cc
           SET settled_period_month = v_start,
               settlement_outcome = 'encashed',
               updated_at = now()
         WHERE cc.id = c.id;
        v_done_encash := v_done_encash + COALESCE(c.credit_days, 0);
      ELSE
        EXIT;
      END IF;
    END LOOP;

    out_employee_id := r.emp_id;
    settled_offset := v_done_offset;
    settled_encash := v_done_encash;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_settle_compoff_credits(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_settle_compoff_credits(date, jsonb) TO service_role;