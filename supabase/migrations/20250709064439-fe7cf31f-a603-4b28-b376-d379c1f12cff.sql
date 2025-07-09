
-- First, remove employees from Technology, Sales, and Marketing departments (if they still exist)
DELETE FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing');

-- Ensure we have a 'user' role
INSERT INTO roles (id, name, description, is_system_role)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'user', 'Standard user role', true)
ON CONFLICT (name) DO NOTHING;

-- Create user accounts for all existing employees
INSERT INTO users (id, username, email, password_hash, first_name, last_name, status)
SELECT 
  gen_random_uuid(),
  LOWER(REPLACE(name, ' ', '.')),
  email,
  crypt('default123', gen_salt('bf')),
  SPLIT_PART(name, ' ', 1),
  CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) > 1 
    THEN ARRAY_TO_STRING(ARRAY_AGE(STRING_TO_ARRAY(name, ' '))[2:], ' ')
    ELSE ''
  END,
  'ACTIVE'
FROM employees 
WHERE email NOT IN (SELECT email FROM users)
ON CONFLICT (email) DO NOTHING;

-- Link employees to their user accounts
UPDATE employees 
SET user_id = users.id
FROM users 
WHERE employees.email = users.email 
AND employees.user_id IS NULL;

-- Assign 'user' role to all employee users
INSERT INTO user_roles (user_id, role_id)
SELECT DISTINCT u.id, '550e8400-e29b-41d4-a716-446655440000'
FROM users u
JOIN employees e ON e.user_id = u.id
WHERE u.id NOT IN (SELECT user_id FROM user_roles WHERE role_id = '550e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (user_id, role_id) DO NOTHING;
