-- Create system_functions table to define available functions
CREATE TABLE public.system_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_key text NOT NULL UNIQUE,
  function_name text NOT NULL,
  description text,
  module text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_functions ENABLE ROW LEVEL SECURITY;

-- Policy for reading functions (anyone authenticated can read)
CREATE POLICY "Allow reading system functions" ON public.system_functions
  FOR SELECT USING (true);

-- Create role_functions table to map roles to functions
CREATE TABLE public.role_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES public.system_functions(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(role_id, function_id)
);

-- Enable RLS
ALTER TABLE public.role_functions ENABLE ROW LEVEL SECURITY;

-- Policy for role_functions
CREATE POLICY "Allow all operations on role_functions" ON public.role_functions
  FOR ALL USING (true) WITH CHECK (true);

-- Insert the purchase functions
INSERT INTO public.system_functions (function_key, function_name, description, module)
VALUES 
  ('purchase_creator', 'Purchase Creator', 'Creates orders, collects client details, TDS and payment information. Cannot add to bank.', 'purchase'),
  ('payer', 'Payer', 'Handles bank additions and payment recording. Cannot collect client details.', 'purchase');

-- Create a function to get user's functions via their role
CREATE OR REPLACE FUNCTION public.get_user_role_functions(p_user_id uuid)
RETURNS TABLE(function_key text, function_name text, module text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sf.function_key, sf.function_name, sf.module
  FROM public.role_functions rf
  JOIN public.system_functions sf ON rf.function_id = sf.id
  JOIN public.user_roles ur ON rf.role_id = ur.role_id
  WHERE ur.user_id = p_user_id;
$$;

-- Create a function to check if a role has purchase permission but no purchase functions
CREATE OR REPLACE FUNCTION public.validate_role_purchase_functions(p_role_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_purchase_permission boolean;
  has_purchase_function boolean;
BEGIN
  -- Check if role has purchase_view or purchase_manage permission
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions 
    WHERE role_id = p_role_id 
    AND permission IN ('purchase_view', 'purchase_manage')
  ) INTO has_purchase_permission;
  
  -- If no purchase permission, validation passes
  IF NOT has_purchase_permission THEN
    RETURN true;
  END IF;
  
  -- Check if role has at least one purchase function
  SELECT EXISTS (
    SELECT 1 FROM public.role_functions rf
    JOIN public.system_functions sf ON rf.function_id = sf.id
    WHERE rf.role_id = p_role_id
    AND sf.module = 'purchase'
  ) INTO has_purchase_function;
  
  RETURN has_purchase_function;
END;
$$;