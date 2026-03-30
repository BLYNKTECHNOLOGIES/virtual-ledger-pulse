INSERT INTO public.platforms (name, is_active)
VALUES 
  ('COINEX', true),
  ('BYBIT', true)
ON CONFLICT DO NOTHING;