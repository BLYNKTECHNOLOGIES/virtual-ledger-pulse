
-- =====================================================
-- Fix Bug L12: Ghost operator phones on sales_orders and clients
-- =====================================================

-- Step 1: Null out ghost operator phones on sales_orders
-- These phones appear across 5+ distinct clients = clearly not a client phone
UPDATE public.sales_orders
SET client_phone = NULL
WHERE client_phone IN (
  SELECT client_phone 
  FROM public.sales_orders 
  WHERE client_phone IS NOT NULL AND client_phone != ''
  GROUP BY client_phone 
  HAVING COUNT(DISTINCT client_name) >= 10
);

-- Step 2: Clean clients table — remove operator phones that appear on 5+ different clients
-- First identify the ghost phones
WITH ghost_phones AS (
  SELECT phone
  FROM public.clients
  WHERE phone IS NOT NULL AND phone != ''
  GROUP BY phone
  HAVING COUNT(*) >= 5
)
UPDATE public.clients
SET phone = NULL, updated_at = now()
WHERE phone IN (SELECT phone FROM ghost_phones);

-- Step 3: Create a blocklist table for known placeholder/operator phones
CREATE TABLE IF NOT EXISTS public.blocked_phone_numbers (
  phone TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'operator_phone',
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the identified ghost phones
INSERT INTO public.blocked_phone_numbers (phone, reason) VALUES
  ('9663926000', 'Operator phone — appeared on 37 distinct clients'),
  ('8849144088', 'Operator phone — appeared on 21 distinct clients'),
  ('8760098623', 'Operator phone — appeared on 20 distinct clients'),
  ('0000000000', 'Placeholder'),
  ('1234567890', 'Placeholder')
ON CONFLICT (phone) DO NOTHING;
