
-- Create user accounts for all existing employees who don't have user_id
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at
)
SELECT 
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  e.email,
  crypt('abc@12345', gen_salt('bf')),
  now(),
  now(),
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  null,
  '{"provider": "email", "providers": ["email"]}',
  json_build_object('full_name', e.name, 'email', e.email),
  false,
  now(),
  now(),
  e.phone,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null,
  false,
  null
FROM public.employees e
WHERE e.user_id IS NULL
RETURNING id, email;

-- Update employees table to link with newly created users
UPDATE public.employees e
SET user_id = u.id
FROM auth.users u
WHERE e.email = u.email 
AND e.user_id IS NULL;

-- Make user_id NOT NULL constraint on employees table
ALTER TABLE public.employees 
ALTER COLUMN user_id SET NOT NULL;

-- Add a constraint to ensure each employee must have a user
ALTER TABLE public.employees 
ADD CONSTRAINT employees_must_have_user 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Create corresponding records in public.users table for the auth users
INSERT INTO public.users (
  id,
  username,
  email,
  first_name,
  last_name,
  phone,
  password_hash,
  status,
  email_verified
)
SELECT 
  au.id,
  LOWER(REPLACE(e.name, ' ', '_')) || '_' || SUBSTRING(e.employee_id, -3),
  au.email,
  SPLIT_PART(e.name, ' ', 1),
  CASE 
    WHEN array_length(string_to_array(e.name, ' '), 1) > 1 
    THEN array_to_string(string_to_array(e.name, ' ')[2:], ' ')
    ELSE ''
  END,
  e.phone,
  au.encrypted_password,
  'ACTIVE',
  true
FROM auth.users au
JOIN public.employees e ON au.email = e.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
);
