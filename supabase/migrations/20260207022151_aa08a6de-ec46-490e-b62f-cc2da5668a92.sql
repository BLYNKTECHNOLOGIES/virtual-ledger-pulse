
CREATE TABLE public.daily_gross_profit_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  gross_profit NUMERIC NOT NULL DEFAULT 0,
  total_sales_qty NUMERIC NOT NULL DEFAULT 0,
  avg_sales_rate NUMERIC NOT NULL DEFAULT 0,
  effective_purchase_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_gross_profit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gross profit history"
  ON public.daily_gross_profit_history
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert gross profit history"
  ON public.daily_gross_profit_history
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update gross profit history"
  ON public.daily_gross_profit_history
  FOR UPDATE
  USING (true);
