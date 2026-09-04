CREATE OR REPLACE FUNCTION public.hr_settle_compoff_credits(
  p_period_month date,
  p_rows jsonb
)
RETURNS TABLE(employee_id uuid, settled_offset numeric, settled_encash numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_period_month)::date;
  v_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  r record;
  c record;
  v_left numeric;
  v_take numeric;
  v_done_offset numeric;
  v_done_encash numeric;
BEGIN
  FOR r IN
    SELECT (x->>'employee_id')::uuid AS emp_id,
           GREATEST(COALESCE((x->>'offset_days')::numeric, 0), 0) AS offset_days,
           GREATEST(COALESCE((x->>'encash_days')::numeric, 0), 0) AS encash_days
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) x
  LOOP
    -- Reverse this month's previous automatic settlement so re-runs are idempotent.
    UPDATE public.hr_compoff_credits
       SET settled_period_month = NULL,
           settlement_outcome = NULL,
           updated_at = now()
     WHERE employee_id = r.emp_id
       AND settled_period_month = v_start
       AND settlement_outcome IN ('offset_lop', 'encashed');

    v_done_offset := 0;
    v_done_encash := 0;

    -- FIFO: oldest unsettled credit first, offsets consumed before encashment.
    FOR c IN
      SELECT id, credit_days
      FROM public.hr_compoff_credits
      WHERE employee_id = r.emp_id
        AND credit_date <= v_end
        AND settled_period_month IS NULL
        AND COALESCE(settlement_outcome, '') <> 'voided_no_attendance_evidence'
      ORDER BY credit_date, id
      FOR UPDATE
    LOOP
      IF v_done_offset < r.offset_days THEN
        UPDATE public.hr_compoff_credits
           SET settled_period_month = v_start,
               settlement_outcome = 'offset_lop',
               updated_at = now()
         WHERE id = c.id;
        v_done_offset := v_done_offset + COALESCE(c.credit_days, 0);
      ELSIF v_done_encash < r.encash_days THEN
        UPDATE public.hr_compoff_credits
           SET settled_period_month = v_start,
               settlement_outcome = 'encashed',
               updated_at = now()
         WHERE id = c.id;
        v_done_encash := v_done_encash + COALESCE(c.credit_days, 0);
      ELSE
        EXIT;
      END IF;
    END LOOP;

    employee_id := r.emp_id;
    settled_offset := v_done_offset;
    settled_encash := v_done_encash;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_settle_compoff_credits(date, jsonb) TO service_role;