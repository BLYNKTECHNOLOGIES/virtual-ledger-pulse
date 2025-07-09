-- Temporarily disable the trigger that auto-creates employees
DROP TRIGGER IF EXISTS on_auth_user_created_employee ON auth.users;

-- Create user accounts for all existing employees who don't have user_id
WITH new_users AS (
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
  RETURNING id, email
)
-- Update employees table to link with newly created users
UPDATE public.employees e
SET user_id = nu.id
FROM new_users nu
WHERE e.email = nu.email;

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
  LOWER(REPLACE(e.name, ' ', '_')) || '_' || RIGHT(e.employee_id, 3),
  au.email,
  SPLIT_PART(e.name, ' ', 1),
  CASE 
    WHEN POSITION(' ' IN e.name) > 0 
    THEN TRIM(SUBSTRING(e.name FROM POSITION(' ' IN e.name) + 1))
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

-- Re-enable the trigger for future user creation (but modified to avoid conflicts)
CREATE OR REPLACE FUNCTION public.create_employee_for_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip creating employee for admin users and if employee already exists
  IF NEW.email != 'blynkvirtualtechnologiespvtld@gmail.com' 
     AND NOT EXISTS (SELECT 1 FROM public.employees WHERE email = NEW.email) THEN
    INSERT INTO public.employees (
      user_id,
      employee_id,
      name,
      email,
      department,
      designation,
      date_of_joining,
      salary,
      status
    ) VALUES (
      NEW.id,
      generate_employee_id('Technology', 'Employee'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', CONCAT(NEW.raw_user_meta_data->>'first_name', ' ', NEW.raw_user_meta_data->>'last_name'), NEW.email),
      NEW.email,
      'Technology',
      'Employee',
      CURRENT_DATE,
      50000,
      'ACTIVE'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created_employee
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_employee_for_user();