
-- Payment Methods Master Table
CREATE TABLE public.payment_methods_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method_name TEXT NOT NULL,
  binance_identifier TEXT NOT NULL UNIQUE,
  binance_pay_type TEXT NOT NULL,
  icon_label TEXT,
  color_accent TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed with allowed payment methods
INSERT INTO public.payment_methods_master (method_name, binance_identifier, binance_pay_type, icon_label, color_accent, sort_order) VALUES
  ('Express UPI', 'ExpressUPI', 'ExpressUPI', 'UPI', '142 71% 45%', 1),
  ('UPI', 'UPI', 'UPI', 'UPI', '142 71% 45%', 2),
  ('IMPS', 'IMPS', 'IMPS', 'IMPS', '24 95% 53%', 3),
  ('NEFT / Bank Transfer India', 'SpecificBank', 'SpecificBank', 'NEFT', '217 91% 60%', 4),
  ('Paytm', 'Paytm', 'Paytm', 'PTM', '199 89% 48%', 5),
  ('PhonePe', 'PhonePe', 'PhonePe', 'PPe', '270 68% 50%', 6),
  ('Google Pay (GPay)', 'GooglePay', 'GooglePay', 'GPay', '217 89% 61%', 7),
  ('Digital eRupee', 'DigitalRupee', 'DigitalRupee', 'e₹', '38 92% 50%', 8),
  ('Lightning UPI', 'LightningUPI', 'LightningUPI', '⚡UPI', '48 96% 53%', 9);

-- Ad Payment Methods Mapping Table
CREATE TABLE public.ad_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  binance_ad_id TEXT NOT NULL,
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods_master(id),
  binance_pay_id INTEGER,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(binance_ad_id, payment_method_id)
);

-- Enable RLS
ALTER TABLE public.payment_methods_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_payment_methods ENABLE ROW LEVEL SECURITY;

-- Payment methods master is readable by all authenticated users
CREATE POLICY "Authenticated users can read payment methods"
  ON public.payment_methods_master FOR SELECT
  USING (auth.role() = 'authenticated');

-- Ad payment methods: authenticated users can CRUD
CREATE POLICY "Authenticated users can read ad payment methods"
  ON public.ad_payment_methods FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert ad payment methods"
  ON public.ad_payment_methods FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update ad payment methods"
  ON public.ad_payment_methods FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete ad payment methods"
  ON public.ad_payment_methods FOR DELETE
  USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_ad_payment_methods_ad_id ON public.ad_payment_methods(binance_ad_id);
CREATE INDEX idx_payment_methods_master_active ON public.payment_methods_master(is_active);
