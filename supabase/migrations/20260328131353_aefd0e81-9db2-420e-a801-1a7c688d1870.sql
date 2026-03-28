-- Restore the employee creation trigger after migration
CREATE OR REPLACE FUNCTION public.create_employee_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;