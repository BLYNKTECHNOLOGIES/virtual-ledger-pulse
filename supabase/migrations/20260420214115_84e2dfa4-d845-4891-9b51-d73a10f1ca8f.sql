UPDATE public.clients
SET client_id = 'RJ' || substr(md5(random()::text || id::text), 1, 4)
WHERE id = '28d88813-9c90-4e85-b379-01eb7ec419fd' AND client_id = 'TEST-RAJ-9999';