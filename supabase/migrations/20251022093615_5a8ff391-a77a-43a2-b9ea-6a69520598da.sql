-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Reset password for Shubham Singh to 'Abhishek' using proper encryption
UPDATE public.users
SET 
  password_hash = crypt('Abhishek', gen_salt('bf')),
  updated_at = NOW()
WHERE id = 'eeaed271-9886-4389-9ced-fdabc443f6bc';