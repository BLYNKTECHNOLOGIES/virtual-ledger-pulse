INSERT INTO public.platforms (name, is_active)
VALUES 
  ('BINANCE', true),
  ('KUCOIN', true),
  ('BITGET', true)
ON CONFLICT DO NOTHING;