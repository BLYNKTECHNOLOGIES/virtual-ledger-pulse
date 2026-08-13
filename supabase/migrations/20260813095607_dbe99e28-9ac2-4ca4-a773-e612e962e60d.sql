CREATE TABLE public.invoice_company_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  company JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_company_profiles TO authenticated;
GRANT ALL ON public.invoice_company_profiles TO service_role;
ALTER TABLE public.invoice_company_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view invoice company profiles" ON public.invoice_company_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create invoice company profiles" ON public.invoice_company_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update invoice company profiles" ON public.invoice_company_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete invoice company profiles" ON public.invoice_company_profiles FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_invoice_company_profiles_updated_at BEFORE UPDATE ON public.invoice_company_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();