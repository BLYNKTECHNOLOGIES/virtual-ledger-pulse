
-- Fix SHIB cost_price: was incorrectly set to 84.50 INR per unit
-- Actual price: ~$0.00000609 * ~93 INR/USD = ~0.000566 INR per unit
UPDATE public.products
SET cost_price = 0.000566
WHERE code = 'SHIB';
