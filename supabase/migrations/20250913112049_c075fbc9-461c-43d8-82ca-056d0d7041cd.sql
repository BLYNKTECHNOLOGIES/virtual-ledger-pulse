-- Just insert the departments if they don't exist (ignore the policy error)
INSERT INTO departments (name, code, description, hierarchy_level, is_active, icon) VALUES
('Technology', 'TECH', 'Technology and Development Department', 1, true, '💻'),
('Sales', 'SALES', 'Sales and Business Development', 2, true, '📈'),
('Human Resources', 'HR', 'Human Resources Management', 3, true, '👥'),
('Finance', 'FIN', 'Finance and Accounting', 4, true, '💰'),
('Marketing', 'MKT', 'Marketing and Communications', 5, true, '📢'),
('Operations', 'OPS', 'Operations and Administration', 6, true, '⚙️'),
('Compliance', 'COMP', 'Compliance and Legal', 7, true, '⚖️')
ON CONFLICT (name) DO NOTHING;