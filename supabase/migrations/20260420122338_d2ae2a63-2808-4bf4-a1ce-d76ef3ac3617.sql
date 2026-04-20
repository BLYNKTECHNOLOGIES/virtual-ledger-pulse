-- Unblock 8760098623 (confirmed to belong to SUJITHA MAHENDRAN) and clear it from
-- 17 unrelated client onboarding approval rows where it was wrongly attached.
DELETE FROM public.blocked_phone_numbers WHERE phone = '8760098623';

UPDATE public.client_onboarding_approvals
SET client_phone = NULL
WHERE client_phone = '8760098623'
  AND client_name NOT ILIKE '%SUJITHA%';

UPDATE public.clients
SET phone = NULL
WHERE phone = '8760098623'
  AND name NOT ILIKE '%SUJITHA%';