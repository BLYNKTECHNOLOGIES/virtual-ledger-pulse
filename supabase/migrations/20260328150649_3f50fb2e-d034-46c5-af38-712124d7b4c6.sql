
-- Drop the incorrect composite unique constraint
ALTER TABLE terminal_order_assignments DROP CONSTRAINT terminal_order_assignments_order_number_is_active_key;

-- Add correct partial unique index: only one active assignment per order
CREATE UNIQUE INDEX terminal_order_assignments_active_unique ON terminal_order_assignments (order_number) WHERE is_active = true;
