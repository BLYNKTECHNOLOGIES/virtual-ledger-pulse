
-- Auto-pay settings for automatically marking buy orders as paid before expiry
CREATE TABLE IF NOT EXISTS public.p2p_auto_pay_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT false,
  minutes_before_expiry INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.p2p_auto_pay_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view auto pay settings" ON public.p2p_auto_pay_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert auto pay settings" ON public.p2p_auto_pay_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update auto pay settings" ON public.p2p_auto_pay_settings FOR UPDATE USING (true);

-- Auto-pay execution log
CREATE TABLE IF NOT EXISTS public.p2p_auto_pay_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'mark_paid',
  status TEXT NOT NULL DEFAULT 'pending',
  minutes_remaining NUMERIC,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.p2p_auto_pay_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view auto pay logs" ON public.p2p_auto_pay_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert auto pay logs" ON public.p2p_auto_pay_log FOR INSERT WITH CHECK (true);

CREATE INDEX idx_auto_pay_log_order ON public.p2p_auto_pay_log(order_number);

-- Insert default settings row
INSERT INTO public.p2p_auto_pay_settings (is_active, minutes_before_expiry) VALUES (false, 3);
