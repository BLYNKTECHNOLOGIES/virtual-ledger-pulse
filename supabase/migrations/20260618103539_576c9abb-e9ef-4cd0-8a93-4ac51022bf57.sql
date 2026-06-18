-- Unique email (case-insensitive). email is NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS users_unique_email_ci
  ON public.users (lower(btrim(email)));

-- Unique phone by normalized digits, only when a phone is actually provided.
CREATE UNIQUE INDEX IF NOT EXISTS users_unique_phone_normalized
  ON public.users (regexp_replace(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> '';
