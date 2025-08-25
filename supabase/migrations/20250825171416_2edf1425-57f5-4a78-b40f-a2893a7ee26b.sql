-- Clear existing departments and add company departments
DELETE FROM public.departments;

-- Insert the 5 company departments
INSERT INTO public.departments (name, code, description, icon, hierarchy_level, is_active) VALUES
('Operations', 'OPS', 'Operations and day-to-day business activities', '⚙️', 2, true),
('Finance', 'FIN', 'Financial management and accounting', '💰', 2, true),
('Compliance', 'COMP', 'Regulatory compliance and legal affairs', '⚖️', 2, true),
('Administrative', 'ADMIN', 'Administrative and support functions', '📋', 3, true),
('Support Staff', 'SUPPORT', 'General support and assistance staff', '🤝', 3, true);