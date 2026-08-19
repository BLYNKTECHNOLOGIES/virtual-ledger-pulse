CREATE TABLE IF NOT EXISTS public.hr_company_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,
  legal_name text NOT NULL DEFAULT '',
  trade_name text NOT NULL DEFAULT '',
  cin text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  pan text NOT NULL DEFAULT '',
  registered_address text NOT NULL DEFAULT '',
  corporate_address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  logo_path text,
  logo_url text,
  letterhead_path text,
  letterhead_url text,
  letterhead_margin_top_mm numeric NOT NULL DEFAULT 35,
  letterhead_margin_bottom_mm numeric NOT NULL DEFAULT 30,
  letterhead_margin_left_mm numeric NOT NULL DEFAULT 19,
  letterhead_margin_right_mm numeric NOT NULL DEFAULT 19,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT hr_company_identity_singleton CHECK (is_singleton)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_company_identity_one_row ON public.hr_company_identity (is_singleton);

GRANT SELECT ON public.hr_company_identity TO authenticated;
GRANT INSERT, UPDATE ON public.hr_company_identity TO authenticated;
GRANT ALL ON public.hr_company_identity TO service_role;

ALTER TABLE public.hr_company_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company identity readable by staff" ON public.hr_company_identity;
CREATE POLICY "company identity readable by staff"
  ON public.hr_company_identity FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "company identity managed by hr" ON public.hr_company_identity;
CREATE POLICY "company identity managed by hr"
  ON public.hr_company_identity FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()))
  WITH CHECK (public.hr_is_hr_staff(auth.uid()));

DROP TRIGGER IF EXISTS hr_company_identity_touch ON public.hr_company_identity;
CREATE TRIGGER hr_company_identity_touch BEFORE UPDATE ON public.hr_company_identity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hr_company_identity (
  legal_name, trade_name, cin, gstin, registered_address, corporate_address,
  phone, email, website, letterhead_url
) VALUES (
  'Blynk Virtual Technologies Private Limited',
  'Blynk Virtual Technologies Private Limited',
  'U62099MP2025PTC074915',
  '23AANCB2572J1ZK',
  '67 Jeet Homes, Vrindavan Nagar, Ayodhya bypass road, Bhopal, Madhya Pradesh - 462022',
  '1st Floor Balwant Arcade, Plot No. 15, opp. GK Palace, MP Nagar Zone-2, Bhopal, Madhya Pradesh 462011',
  '+91 92667 12788',
  'hr@blynkex.com',
  'www.blynkex.com',
  '/__l5e/assets-v1/eec99c7f-41d2-48a1-b7f3-86bc33566d09/blynk-letterhead-a4.jpg'
) ON CONFLICT DO NOTHING;