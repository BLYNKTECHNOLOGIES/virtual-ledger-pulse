
-- Update employees table to support organizational hierarchy
-- First, let's update the existing employees with proper departments and designations

-- Update department structure to match organizational chart
UPDATE employees SET department = 'Board' WHERE designation = 'Director';
UPDATE employees SET department = 'Executive' WHERE designation = 'General Manager';

-- Add hierarchy level and reporting structure
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 1;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_payment_rights BOOLEAN DEFAULT false;

-- Create the organizational structure with proper designations
-- First create Board of Directors (Level 1)
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level)
VALUES 
  ('BOD001', 'Director One', 'director1@blynkvirtual.com', 'Board', 'Director', CURRENT_DATE, 2000000, 'ACTIVE', 1),
  ('BOD002', 'Director Two', 'director2@blynkvirtual.com', 'Board', 'Director', CURRENT_DATE, 2000000, 'ACTIVE', 1)
ON CONFLICT (employee_id) DO NOTHING;

-- Create General Manager (Level 2)
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'GM001', 'General Manager', 'gm@blynkvirtual.com', 'Executive', 'General Manager', CURRENT_DATE, 1500000, 'ACTIVE', 2, e.id
FROM employees e WHERE e.designation = 'Director' LIMIT 1
ON CONFLICT (employee_id) DO NOTHING;

-- Create Department Heads (Level 3)
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'CFO001', 'Chief Financial Officer', 'cfo@blynkvirtual.com', 'Finance', 'CFO', CURRENT_DATE, 1200000, 'ACTIVE', 3, gm.id
FROM employees gm WHERE gm.designation = 'General Manager'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'COO001', 'Chief Operating Officer', 'coo@blynkvirtual.com', 'Operations', 'COO', CURRENT_DATE, 1200000, 'ACTIVE', 3, gm.id
FROM employees gm WHERE gm.designation = 'General Manager'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'CCO001', 'Chief Compliance Officer', 'cco@blynkvirtual.com', 'Compliance', 'CCO', CURRENT_DATE, 1200000, 'ACTIVE', 3, gm.id
FROM employees gm WHERE gm.designation = 'General Manager'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Assistant Managers under Finance (Level 4)
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINASST001', 'Finance Assistant Manager 1', 'finasst1@blynkvirtual.com', 'Finance', 'Assistant Manager', CURRENT_DATE, 800000, 'ACTIVE', 4, cfo.id, true
FROM employees cfo WHERE cfo.designation = 'CFO'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINASST002', 'Finance Assistant Manager 2', 'finasst2@blynkvirtual.com', 'Finance', 'Assistant Manager', CURRENT_DATE, 800000, 'ACTIVE', 4, cfo.id, true
FROM employees cfo WHERE cfo.designation = 'CFO'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Accountant directly under CFO
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'ACC001', 'Senior Accountant', 'accountant@blynkvirtual.com', 'Finance', 'Accountant', CURRENT_DATE, 600000, 'ACTIVE', 4, cfo.id
FROM employees cfo WHERE cfo.designation = 'CFO'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Assistant Managers under Operations (Level 4)
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPASST001', 'Operations Assistant Manager 1', 'opasst1@blynkvirtual.com', 'Operations', 'Assistant Manager', CURRENT_DATE, 800000, 'ACTIVE', 4, coo.id
FROM employees coo WHERE coo.designation = 'COO'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPASST002', 'Operations Assistant Manager 2', 'opasst2@blynkvirtual.com', 'Operations', 'Assistant Manager', CURRENT_DATE, 800000, 'ACTIVE', 4, coo.id
FROM employees coo WHERE coo.designation = 'COO'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Compliance Officers under CCO (Level 4)
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'COMP001', 'Compliance Officer 1', 'comp1@blynkvirtual.com', 'Compliance', 'Compliance Officer', CURRENT_DATE, 700000, 'ACTIVE', 4, cco.id
FROM employees cco WHERE cco.designation = 'CCO'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'COMP002', 'Compliance Officer 2', 'comp2@blynkvirtual.com', 'Compliance', 'Compliance Officer', CURRENT_DATE, 700000, 'ACTIVE', 4, cco.id
FROM employees cco WHERE cco.designation = 'CCO'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'COMP003', 'Compliance Officer 3', 'comp3@blynkvirtual.com', 'Compliance', 'Compliance Officer', CURRENT_DATE, 700000, 'ACTIVE', 4, cco.id
FROM employees cco WHERE cco.designation = 'CCO'
ON CONFLICT (employee_id) DO NOTHING;

-- Create On-field Officer under CCO
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'ONFIELD001', 'On-field Officer', 'onfield@blynkvirtual.com', 'Compliance', 'On-field Officer', CURRENT_DATE, 600000, 'ACTIVE', 4, cco.id
FROM employees cco WHERE cco.designation = 'CCO'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Auditor under On-field Officer
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'AUD001', 'Senior Auditor', 'auditor@blynkvirtual.com', 'Compliance', 'Auditor', CURRENT_DATE, 550000, 'ACTIVE', 5, onfield.id
FROM employees onfield WHERE onfield.designation = 'On-field Officer'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Finance Employees (Level 5) - 3 under each Assistant Manager with payment rights
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINEMP001', 'Finance Employee 1', 'finemp1@blynkvirtual.com', 'Finance', 'Finance Executive', CURRENT_DATE, 400000, 'ACTIVE', 5, asst1.id, true
FROM employees asst1 WHERE asst1.employee_id = 'FINASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINEMP002', 'Finance Employee 2', 'finemp2@blynkvirtual.com', 'Finance', 'Finance Executive', CURRENT_DATE, 400000, 'ACTIVE', 5, asst1.id, true
FROM employees asst1 WHERE asst1.employee_id = 'FINASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINEMP003', 'Finance Employee 3', 'finemp3@blynkvirtual.com', 'Finance', 'Finance Executive', CURRENT_DATE, 400000, 'ACTIVE', 5, asst1.id, true
FROM employees asst1 WHERE asst1.employee_id = 'FINASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINEMP004', 'Finance Employee 4', 'finemp4@blynkvirtual.com', 'Finance', 'Finance Executive', CURRENT_DATE, 400000, 'ACTIVE', 5, asst2.id, true
FROM employees asst2 WHERE asst2.employee_id = 'FINASST002'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINEMP005', 'Finance Employee 5', 'finemp5@blynkvirtual.com', 'Finance', 'Finance Executive', CURRENT_DATE, 400000, 'ACTIVE', 5, asst2.id, true
FROM employees asst2 WHERE asst2.employee_id = 'FINASST002'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to, has_payment_rights)
SELECT 'FINEMP006', 'Finance Employee 6', 'finemp6@blynkvirtual.com', 'Finance', 'Finance Executive', CURRENT_DATE, 400000, 'ACTIVE', 5, asst2.id, true
FROM employees asst2 WHERE asst2.employee_id = 'FINASST002'
ON CONFLICT (employee_id) DO NOTHING;

-- Create Operations Employees (Level 5) - 4-5 under each Assistant Manager
INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP001', 'Operations Executive 1', 'opemp1@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst1.id
FROM employees asst1 WHERE asst1.employee_id = 'OPASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP002', 'Operations Executive 2', 'opemp2@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst1.id
FROM employees asst1 WHERE asst1.employee_id = 'OPASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP003', 'Operations Executive 3', 'opemp3@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst1.id
FROM employees asst1 WHERE asst1.employee_id = 'OPASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP004', 'Operations Executive 4', 'opemp4@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst1.id
FROM employees asst1 WHERE asst1.employee_id = 'OPASST001'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP005', 'Operations Executive 5', 'opemp5@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst2.id
FROM employees asst2 WHERE asst2.employee_id = 'OPASST002'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP006', 'Operations Executive 6', 'opemp6@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst2.id
FROM employees asst2 WHERE asst2.employee_id = 'OPASST002'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP007', 'Operations Executive 7', 'opemp7@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst2.id
FROM employees asst2 WHERE asst2.employee_id = 'OPASST002'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP008', 'Operations Executive 8', 'opemp8@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst2.id
FROM employees asst2 WHERE asst2.employee_id = 'OPASST002'
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employees (employee_id, name, email, department, designation, date_of_joining, salary, status, hierarchy_level, reports_to)
SELECT 'OPEMP009', 'Operations Executive 9', 'opemp9@blynkvirtual.com', 'Operations', 'Operations Executive', CURRENT_DATE, 350000, 'ACTIVE', 5, asst2.id
FROM employees asst2 WHERE asst2.employee_id = 'OPASST002'
ON CONFLICT (employee_id) DO NOTHING;

-- Create index for better performance on hierarchy queries
CREATE INDEX IF NOT EXISTS idx_employees_hierarchy ON employees(hierarchy_level, reports_to);
CREATE INDEX IF NOT EXISTS idx_employees_department_hierarchy ON employees(department, hierarchy_level);
