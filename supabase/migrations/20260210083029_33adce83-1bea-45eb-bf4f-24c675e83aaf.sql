
-- Create spot trade history table for internal audit logging
CREATE TABLE public.spot_trade_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL,
  executed_price NUMERIC,
  quote_quantity NUMERIC,
  binance_order_id TEXT,
  execution_method TEXT NOT NULL DEFAULT 'SPOT' CHECK (execution_method IN ('SPOT', 'CONVERT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FILLED', 'FAILED', 'PARTIAL')),
  funding_transfer_done BOOLEAN DEFAULT false,
  error_message TEXT,
  executed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spot_trade_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view and insert
CREATE POLICY "Authenticated users can view trade history"
  ON public.spot_trade_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert trade history"
  ON public.spot_trade_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update trade history"
  ON public.spot_trade_history FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Index for quick lookups
CREATE INDEX idx_spot_trade_history_symbol ON public.spot_trade_history(symbol);
CREATE INDEX idx_spot_trade_history_created ON public.spot_trade_history(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_spot_trade_history_updated_at
  BEFORE UPDATE ON public.spot_trade_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
