-- Create positions table if it doesn't exist
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  hierarchy_level INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample departments
INSERT INTO departments (name, code, description, hierarchy_level, is_active, icon) VALUES
('Technology', 'TECH', 'Technology and Development Department', 1, true, '💻'),
('Sales', 'SALES', 'Sales and Business Development', 2, true, '📈'),
('Human Resources', 'HR', 'Human Resources Management', 3, true, '👥'),
('Finance', 'FIN', 'Finance and Accounting', 4, true, '💰'),
('Marketing', 'MKT', 'Marketing and Communications', 5, true, '📢'),
('Operations', 'OPS', 'Operations and Administration', 6, true, '⚙️'),
('Compliance', 'COMP', 'Compliance and Legal', 7, true, '⚖️')
ON CONFLICT (name) DO NOTHING;

-- Insert sample positions for each department
INSERT INTO positions (title, department_id, hierarchy_level, is_active) VALUES
-- Technology positions
('Software Engineer', (SELECT id FROM departments WHERE code = 'TECH'), 1, true),
('Senior Software Engineer', (SELECT id FROM departments WHERE code = 'TECH'), 2, true),
('Team Lead', (SELECT id FROM departments WHERE code = 'TECH'), 3, true),
('Technical Manager', (SELECT id FROM departments WHERE code = 'TECH'), 4, true),

-- Sales positions
('Sales Executive', (SELECT id FROM departments WHERE code = 'SALES'), 1, true),
('Senior Sales Executive', (SELECT id FROM departments WHERE code = 'SALES'), 2, true),
('Sales Manager', (SELECT id FROM departments WHERE code = 'SALES'), 3, true),
('Sales Director', (SELECT id FROM departments WHERE code = 'SALES'), 4, true),

-- HR positions
('HR Executive', (SELECT id FROM departments WHERE code = 'HR'), 1, true),
('HR Manager', (SELECT id FROM departments WHERE code = 'HR'), 2, true),
('HR Director', (SELECT id FROM departments WHERE code = 'HR'), 3, true),

-- Finance positions
('Finance Executive', (SELECT id FROM departments WHERE code = 'FIN'), 1, true),
('Accountant', (SELECT id FROM departments WHERE code = 'FIN'), 1, true),
('Finance Manager', (SELECT id FROM departments WHERE code = 'FIN'), 2, true),
('Finance Director', (SELECT id FROM departments WHERE code = 'FIN'), 3, true),

-- Marketing positions
('Marketing Executive', (SELECT id FROM departments WHERE code = 'MKT'), 1, true),
('Marketing Manager', (SELECT id FROM departments WHERE code = 'MKT'), 2, true),
('Marketing Director', (SELECT id FROM departments WHERE code = 'MKT'), 3, true),

-- Operations positions
('Operations Executive', (SELECT id FROM departments WHERE code = 'OPS'), 1, true),
('Operations Manager', (SELECT id FROM departments WHERE code = 'OPS'), 2, true),
('Operations Director', (SELECT id FROM departments WHERE code = 'OPS'), 3, true),

-- Compliance positions
('Compliance Officer', (SELECT id FROM departments WHERE code = 'COMP'), 1, true),
('Compliance Manager', (SELECT id FROM departments WHERE code = 'COMP'), 2, true),
('Compliance Director', (SELECT id FROM departments WHERE code = 'COMP'), 3, true);

-- Enable RLS on positions table
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for positions
CREATE POLICY "Allow all operations on positions" ON positions FOR ALL USING (true);

-- Add trigger for updated_at on positions
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();