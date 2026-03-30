INSERT INTO public.platforms (name, is_active)
VALUES 
  ('BINANCE SS', true),
  ('BINANCE BLYNK', true),
  ('BINANCE AS', true)
ON CONFLICT DO NOTHING;