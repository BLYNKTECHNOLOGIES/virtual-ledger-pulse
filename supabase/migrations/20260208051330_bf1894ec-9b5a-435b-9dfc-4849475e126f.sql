
CREATE TABLE public.ad_rest_timer (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INT NOT NULL DEFAULT 60,
  started_by TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_ad_nos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_rest_timer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rest timer" ON public.ad_rest_timer FOR SELECT USING (true);
CREATE POLICY "Anyone can insert rest timer" ON public.ad_rest_timer FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rest timer" ON public.ad_rest_timer FOR UPDATE USING (true);
