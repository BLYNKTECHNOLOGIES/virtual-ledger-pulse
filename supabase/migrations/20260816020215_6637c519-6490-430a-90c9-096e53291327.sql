-- 1. leave type optional until HR approval
ALTER TABLE public.hr_leave_requests ALTER COLUMN leave_type_id DROP NOT NULL;

UPDATE public.hr_leave_requests
SET leave_type_id = NULL
WHERE lower(status) IN ('requested','pending','manager_approved');

-- 2. consumption ledger
CREATE TABLE IF NOT EXISTS public.hr_leave_request_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.hr_leave_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  leave_type_id uuid REFERENCES public.hr_leave_types(id),
  days numeric NOT NULL DEFAULT 0,
  source text NOT NULL CHECK (source IN ('assigned','compoff_fallback','casual_fallback','unpaid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_request_consumption TO authenticated;
GRANT ALL ON public.hr_leave_request_consumption TO service_role;

ALTER TABLE public.hr_leave_request_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff manage leave consumption"
  ON public.hr_leave_request_consumption FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()))
  WITH CHECK (public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "Employees read their own leave consumption"
  ON public.hr_leave_request_consumption FOR SELECT TO authenticated
  USING (employee_id = public.hr_current_employee_id());

CREATE INDEX IF NOT EXISTS idx_leave_consumption_request ON public.hr_leave_request_consumption(request_id);
CREATE INDEX IF NOT EXISTS idx_leave_consumption_emp ON public.hr_leave_request_consumption(employee_id);

-- 3. helper: take up to p_want days from a leave type, return what was actually taken
CREATE OR REPLACE FUNCTION public.hr_leave_take_from(
  p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_want numeric
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_avail numeric := 0; v_take numeric := 0;
BEGIN
  IF p_leave_type_id IS NULL OR COALESCE(p_want,0) <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(available_days),0) INTO v_avail
  FROM public.hr_leave_allocations
  WHERE employee_id = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
    AND quarter IN (CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int);

  v_take := LEAST(GREATEST(p_want,0), GREATEST(v_avail,0));
  IF v_take > 0 THEN
    PERFORM public.hr_move_leave_balance(p_employee_id, p_leave_type_id, p_start, p_end, v_take, -1);
  END IF;
  RETURN v_take;
END $$;

-- 4. BEFORE trigger: normalise total_days, require a type on approval (no paid/unpaid maths here)
CREATE OR REPLACE FUNCTION public.fn_validate_leave_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_computed numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.leave_type_id IS NULL THEN
      RAISE EXCEPTION 'Pick a leave type before approving this request';
    END IF;

    IF NEW.is_half_day = true THEN
      v_computed := 0.5;
    ELSE
      v_computed := fn_calculate_leave_days(NEW.employee_id, NEW.start_date, NEW.end_date, NEW.leave_type_id);
    END IF;
    IF v_computed > 0 AND v_computed <> NEW.total_days THEN
      NEW.total_days := v_computed;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 5. cascade settle / restore
CREATE OR REPLACE FUNCTION public.fn_leave_balance_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_remaining numeric;
  v_taken numeric;
  v_is_paid boolean;
  v_code text;
  v_co uuid;
  v_cl uuid;
  r record;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code, is_paid INTO v_code, v_is_paid FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
    SELECT id INTO v_co FROM public.hr_leave_types WHERE code = 'CO' AND is_active LIMIT 1;
    SELECT id INTO v_cl FROM public.hr_leave_types WHERE code = 'CL' AND is_active LIMIT 1;

    DELETE FROM public.hr_leave_request_consumption WHERE request_id = NEW.id;

    v_remaining := GREATEST(COALESCE(NEW.total_days,0), 0);

    IF v_code = 'LOP' OR COALESCE(v_is_paid, false) = false THEN
      NEW.paid_days := 0;
      NEW.unpaid_days := v_remaining;
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NULL, v_remaining, 'unpaid');
      RETURN NEW;
    END IF;

    -- a. assigned type
    v_taken := public.hr_leave_take_from(NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date, v_remaining);
    IF v_taken > 0 THEN
      v_remaining := v_remaining - v_taken;
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NEW.leave_type_id, v_taken, 'assigned');
    END IF;

    -- b. comp-off fallback (expires monthly, so used first)
    IF v_remaining > 0 AND v_co IS NOT NULL AND v_co <> NEW.leave_type_id THEN
      v_taken := public.hr_leave_take_from(NEW.employee_id, v_co, NEW.start_date, NEW.end_date, v_remaining);
      IF v_taken > 0 THEN
        v_remaining := v_remaining - v_taken;
        INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
        VALUES (NEW.id, NEW.employee_id, v_co, v_taken, 'compoff_fallback');
      END IF;
    END IF;

    -- c. casual leave fallback
    IF v_remaining > 0 AND v_cl IS NOT NULL AND v_cl <> NEW.leave_type_id THEN
      v_taken := public.hr_leave_take_from(NEW.employee_id, v_cl, NEW.start_date, NEW.end_date, v_remaining);
      IF v_taken > 0 THEN
        v_remaining := v_remaining - v_taken;
        INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
        VALUES (NEW.id, NEW.employee_id, v_cl, v_taken, 'casual_fallback');
      END IF;
    END IF;

    IF v_remaining > 0 THEN
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NULL, v_remaining, 'unpaid');
    END IF;

    NEW.unpaid_days := GREATEST(v_remaining, 0);
    NEW.paid_days := GREATEST(COALESCE(NEW.total_days,0) - NEW.unpaid_days, 0);
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelled','rejected') AND OLD.status = 'approved' THEN
    FOR r IN SELECT * FROM public.hr_leave_request_consumption
             WHERE request_id = OLD.id AND leave_type_id IS NOT NULL
    LOOP
      PERFORM public.hr_move_leave_balance(OLD.employee_id, r.leave_type_id,
        OLD.start_date, OLD.end_date, r.days, 1);
    END LOOP;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = OLD.id;
    NEW.paid_days := 0;
    NEW.unpaid_days := 0;
  END IF;

  RETURN NEW;
END $$;

-- 6. comp-off pool must see fallback consumption as "taken"
CREATE OR REPLACE FUNCTION public.hr_compoff_month_pool(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(employee_id uuid, days_earned numeric, days_opening numeric, days_taken numeric, days_available numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    SELECT k.employee_id, SUM(k.d) AS d
    FROM (
      SELECT r.employee_id, SUM(COALESCE(r.total_days,0)) AS d
      FROM public.hr_leave_requests r
      JOIN public.hr_leave_types t ON t.id = r.leave_type_id AND t.code = 'CO'
      , ms
      WHERE r.employee_id = ANY(p_employee_ids)
        AND lower(r.status) = 'approved'
        AND r.start_date <= ms.e AND r.end_date >= ms.s
      GROUP BY r.employee_id
      UNION ALL
      SELECT r.employee_id, SUM(COALESCE(cs.days,0)) AS d
      FROM public.hr_leave_request_consumption cs
      JOIN public.hr_leave_requests r ON r.id = cs.request_id
      , ms
      WHERE cs.source = 'compoff_fallback'
        AND r.employee_id = ANY(p_employee_ids)
        AND lower(r.status) = 'approved'
        AND r.start_date <= ms.e AND r.end_date >= ms.s
      GROUP BY r.employee_id
    ) k
    GROUP BY k.employee_id
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