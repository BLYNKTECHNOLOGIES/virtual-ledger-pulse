-- Add user_id column to employees table to link users with employees
ALTER TABLE public.employees ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_employees_user_id ON public.employees(user_id);

-- Add unique constraint to ensure one employee per user
ALTER TABLE public.employees ADD CONSTRAINT unique_employee_user_id UNIQUE (user_id);

-- Create function to automatically create employee record when user is created (except for admin)
CREATE OR REPLACE FUNCTION public.create_employee_for_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip creating employee for admin users
  IF NEW.email != 'blynkvirtualtechnologiespvtld@gmail.com' THEN
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

-- Create trigger to automatically create employee when user signs up
CREATE TRIGGER on_auth_user_created_employee
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_employee_for_user();