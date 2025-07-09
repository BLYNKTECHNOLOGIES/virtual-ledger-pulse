-- Create departments table
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT '🏢',
  hierarchy_level INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert existing departments
INSERT INTO public.departments (name, code, description, icon, hierarchy_level) VALUES
('Board', 'BOARD', 'Board of Directors', '📋', 1),
('Executive', 'EXEC', 'Executive Management', '🎯', 2),
('Finance', 'FIN', 'Finance Department', '💰', 3),
('Operations', 'OPS', 'Operations Department', '⚙️', 3),
('Compliance', 'COMP', 'Compliance Department', '⚖️', 3);

-- Create positions table for job roles/posts
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  hierarchy_level INTEGER DEFAULT 5,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert positions for each department
INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Director', id, 1 FROM public.departments WHERE name = 'Board';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'General Manager', id, 2 FROM public.departments WHERE name = 'Executive';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Finance Manager', id, 3 FROM public.departments WHERE name = 'Finance';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Finance Executive', id, 4 FROM public.departments WHERE name = 'Finance';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Operations Manager', id, 3 FROM public.departments WHERE name = 'Operations';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Operations Executive', id, 4 FROM public.departments WHERE name = 'Operations';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Compliance Manager', id, 3 FROM public.departments WHERE name = 'Compliance';

INSERT INTO public.positions (title, department_id, hierarchy_level) 
SELECT 'Compliance Executive', id, 4 FROM public.departments WHERE name = 'Compliance';

-- Add department_id and position_id columns to employees table
ALTER TABLE public.employees ADD COLUMN department_id UUID REFERENCES public.departments(id);
ALTER TABLE public.employees ADD COLUMN position_id UUID REFERENCES public.positions(id);

-- Update existing employees to link with departments
UPDATE public.employees 
SET department_id = d.id 
FROM public.departments d 
WHERE employees.department = d.name;

-- Enable RLS on new tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on departments" 
ON public.departments FOR ALL USING (true);

CREATE POLICY "Allow all operations on positions" 
ON public.positions FOR ALL USING (true);

-- Create indexes for better performance
CREATE INDEX idx_employees_department_id ON public.employees(department_id);
CREATE INDEX idx_employees_position_id ON public.employees(position_id);
CREATE INDEX idx_positions_department_id ON public.positions(department_id);