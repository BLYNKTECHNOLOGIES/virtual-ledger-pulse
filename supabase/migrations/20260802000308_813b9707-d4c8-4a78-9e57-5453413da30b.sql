CREATE TABLE IF NOT EXISTS public.hr_razorpay_orphans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_employee_id text NOT NULL UNIQUE,
  name text,
  email text,
  phone text,
  pan text,
  department text,
  designation text,
  date_of_joining date,
  raw_snapshot jsonb,
  status text NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_orphans TO authenticated;
GRANT ALL ON public.hr_razorpay_orphans TO service_role;

ALTER TABLE public.hr_razorpay_orphans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view razorpay orphans"
  ON public.hr_razorpay_orphans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage razorpay orphans"
  ON public.hr_razorpay_orphans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hr_razorpay_orphans_status ON public.hr_razorpay_orphans(status);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_hr_razorpay_orphans_updated_at ON public.hr_razorpay_orphans;
CREATE TRIGGER trg_hr_razorpay_orphans_updated_at
  BEFORE UPDATE ON public.hr_razorpay_orphans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();