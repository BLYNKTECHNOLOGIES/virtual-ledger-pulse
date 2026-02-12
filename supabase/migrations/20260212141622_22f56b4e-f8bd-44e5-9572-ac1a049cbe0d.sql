
-- Fix corrupted current_usage values for IndusInd payment methods
-- Reset to match actual pending settlement amounts

-- pos.11329613@indus: pending = 328,403 (was 4,469,052,500)
UPDATE public.sales_payment_methods
SET current_usage = 328403, last_reset = now()
WHERE id = '2e736d39-74f7-45f0-b3a2-2067cdb0ec8e';

-- pos.11375848@indus: pending = 232,406.12 (was 362,406.12)
UPDATE public.sales_payment_methods
SET current_usage = 232406.12, last_reset = now()
WHERE id = '110af1c1-fe32-4374-a27c-ae5c99a951f3';

-- pos.5307682@indus: pending = 40,000 (was 9,000,149,905.05)
UPDATE public.sales_payment_methods
SET current_usage = 40000, last_reset = now()
WHERE id = 'd8a803ad-6169-4f1f-9557-b1c92dcaf221';

-- pos.5346485@indus: already 0, no pending - just reset date
UPDATE public.sales_payment_methods
SET last_reset = now()
WHERE id = 'aa8cd764-16fc-47f9-a819-2e02ace256db';
