
ALTER TABLE public.hr_compoff_credits
  ADD COLUMN IF NOT EXISTS settled_period_month date,
  ADD COLUMN IF NOT EXISTS settlement_outcome text;

CREATE INDEX IF NOT EXISTS idx_compoff_credits_unsettled
  ON public.hr_compoff_credits (employee_id, credit_date)
  WHERE settled_period_month IS NULL;

CREATE TABLE IF NOT EXISTS public.hr_compoff_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  days_earned numeric NOT NULL DEFAULT 0,
  days_taken numeric NOT NULL DEFAULT 0,
  days_offset_lop numeric NOT NULL DEFAULT 0,
  days_encashed numeric NOT NULL DEFAULT 0,
  per_day_rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  base_source text,
  addition_id uuid,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month)
);

GRANT SELECT ON public.hr_compoff_settlements TO authenticated;
GRANT ALL ON public.hr_compoff_settlements TO service_role;
ALTER TABLE public.hr_compoff_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view comp-off settlements"
  ON public.hr_compoff_settlements FOR SELECT TO authenticated
  USING (
    public.hr_is_hr_staff(auth.uid())
    OR employee_id IN (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid())
  );

CREATE TRIGGER trg_compoff_settlements_updated_at
  BEFORE UPDATE ON public.hr_compoff_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.hr_compoff_month_pool(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(
  employee_id uuid,
  days_earned numeric,
  days_opening numeric,
  days_taken numeric,
  days_available numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ms AS (SELECT date_trunc('month', p_period_month)::date AS s,
                     (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date AS e),
  emp AS (SELECT unnest(p_employee_ids) AS id),
  credits AS (
    SELECT c.employee_id,
           SUM(c.credit_days) FILTER (WHERE c.credit_date >= (SELECT s FROM ms)) AS earned,
           SUM(c.credit_days) FILTER (WHERE c.credit_date < (SELECT s FROM ms)) AS opening
    FROM public.hr_compoff_credits c, ms
    WHERE c.employee_id = ANY(p_employee_ids)
      AND c.credit_date <= ms.e
      AND c.settled_period_month IS NULL
    GROUP BY c.employee_id
  ),
  taken AS (
    SELECT r.employee_id, SUM(COALESCE(r.total_days,0)) AS d
    FROM public.hr_leave_requests r
    JOIN public.hr_leave_types t ON t.id = r.leave_type_id AND t.code = 'CO'
    , ms
    WHERE r.employee_id = ANY(p_employee_ids)
      AND lower(r.status) = 'approved'
      AND r.start_date <= ms.e AND r.end_date >= ms.s
    GROUP BY r.employee_id
  )
  SELECT emp.id,
         COALESCE(c.earned,0)::numeric,
         COALESCE(c.opening,0)::numeric,
         COALESCE(t.d,0)::numeric,
         GREATEST(COALESCE(c.earned,0) + COALESCE(c.opening,0) - COALESCE(t.d,0), 0)::numeric
  FROM emp
  LEFT JOIN credits c ON c.employee_id = emp.id
  LEFT JOIN taken t ON t.employee_id = emp.id;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compoff_month_pool(uuid[], date) TO authenticated, service_role;

-- Month close: consume every comp-off credit up to the period, recording how it was settled.
CREATE OR REPLACE FUNCTION public.hr_compoff_close_month(p_period_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_end date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_count integer;
  v_co_type uuid;
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT id INTO v_co_type FROM public.hr_leave_types WHERE code = 'CO' AND is_active LIMIT 1;

  UPDATE public.hr_compoff_credits c
  SET settled_period_month = date_trunc('month', p_period_month)::date,
      settlement_outcome = COALESCE(c.settlement_outcome, 'settled_in_payroll')
  WHERE c.settled_period_month IS NULL
    AND c.credit_date <= v_end;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Comp-off never carries forward: zero the CO leave allocation balances.
  IF v_co_type IS NOT NULL THEN
    UPDATE public.hr_leave_allocations
    SET available_days = 0, updated_at = now()
    WHERE leave_type_id = v_co_type;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compoff_close_month(date) TO authenticated, service_role;
