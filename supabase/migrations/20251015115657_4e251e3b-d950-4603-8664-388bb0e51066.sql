-- Reset password for Shubham Singh back to 'Abhishek'
UPDATE public.users
SET 
  password_hash = crypt('Abhishek', gen_salt('bf')),
  updated_at = NOW()
WHERE id = 'eeaed271-9886-4389-9ced-fdabc443f6bc';