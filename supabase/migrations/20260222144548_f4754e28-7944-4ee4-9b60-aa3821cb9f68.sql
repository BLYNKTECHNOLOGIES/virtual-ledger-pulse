
-- Track comp-off credits earned by working on Sunday/holiday
CREATE TABLE public.hr_compoff_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
  credit_date date NOT NULL, -- the Sunday/holiday date worked
  credit_type text NOT NULL DEFAULT 'sunday', -- 'sunday' or 'holiday'
  credit_days numeric NOT NULL DEFAULT 1, -- 1 for full day, 0.5 for half day
  is_allocated boolean NOT NULL DEFAULT false, -- true once leave allocation created
  allocated_at timestamptz,
  leave_allocation_id uuid, -- reference to hr_leave_allocations if created
  expires_at date, -- no expiry until year-end per user preference
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, credit_date)
);

-- Set expiry to end of year by default
CREATE OR REPLACE FUNCTION set_compoff_expiry() RETURNS trigger AS $$
BEGIN
  NEW.expires_at := (date_trunc('year', NEW.credit_date) + interval '1 year - 1 day')::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_compoff_expiry
  BEFORE INSERT ON public.hr_compoff_credits
  FOR EACH ROW EXECUTE FUNCTION set_compoff_expiry();
