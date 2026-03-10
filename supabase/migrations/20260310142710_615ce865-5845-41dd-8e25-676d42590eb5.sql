
-- Add 'auto_scope' to the assignment_type check constraint
ALTER TABLE terminal_order_assignments 
DROP CONSTRAINT terminal_order_assignments_assignment_type_check;

ALTER TABLE terminal_order_assignments 
ADD CONSTRAINT terminal_order_assignments_assignment_type_check 
CHECK (assignment_type = ANY (ARRAY['manual', 'auto', 'reassigned', 'auto_scope']));
