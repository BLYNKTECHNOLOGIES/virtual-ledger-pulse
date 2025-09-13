-- Update departments to match company structure
-- First, delete existing departments that are not needed
DELETE FROM departments WHERE code NOT IN ('OPS', 'FIN', 'COMP');

-- Update existing departments to match company naming
UPDATE departments SET 
  name = 'Operations',
  code = 'OPS',
  description = 'Operations Department',
  hierarchy_level = 1,
  icon = '⚙️'
WHERE code = 'OPS';

UPDATE departments SET 
  name = 'Finance',
  code = 'FIN',
  description = 'Finance Department',
  hierarchy_level = 2,
  icon = '💰'
WHERE code = 'FIN';

UPDATE departments SET 
  name = 'Compliance',
  code = 'COMP',
  description = 'Compliance Department',
  hierarchy_level = 3,
  icon = '⚖️'
WHERE code = 'COMP';

-- Add the missing departments
INSERT INTO departments (name, code, description, hierarchy_level, is_active, icon) VALUES
('Administrative', 'ADMIN', 'Administrative Department', 4, true, '📋'),
('Support Staff', 'SUPPORT', 'Support Staff Department', 5, true, '🤝')
ON CONFLICT (name) DO NOTHING;