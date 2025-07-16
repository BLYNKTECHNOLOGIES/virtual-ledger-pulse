-- Update all products without warehouse_id to use Secondary Warehouse
UPDATE products 
SET warehouse_id = 'ba4ffc0d-8dfa-4790-97ba-c3bae2c167b1'
WHERE warehouse_id IS NULL;

-- Create or update warehouse stock movements for products that don't have proper warehouse assignments
-- This will ensure all stock is properly tracked in the Secondary Warehouse
INSERT INTO warehouse_stock_movements (product_id, warehouse_id, movement_type, quantity, reason, reference_type)
SELECT 
    p.id,
    'ba4ffc0d-8dfa-4790-97ba-c3bae2c167b1' as warehouse_id,
    'ADJUSTMENT' as movement_type,
    p.current_stock_quantity as quantity,
    'Initial stock assignment to Secondary Warehouse' as reason,
    'system_migration' as reference_type
FROM products p
WHERE p.current_stock_quantity > 0 
AND NOT EXISTS (
    SELECT 1 FROM warehouse_stock_movements wsm 
    WHERE wsm.product_id = p.id 
    AND wsm.warehouse_id = 'ba4ffc0d-8dfa-4790-97ba-c3bae2c167b1'
);

-- Update the warehouse stock calculation to be consistent
-- Create a function to sync stock across all systems
CREATE OR REPLACE FUNCTION sync_product_warehouse_stock()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    product_record RECORD;
    warehouse_total numeric;
BEGIN
    -- Loop through all products
    FOR product_record IN SELECT id FROM products LOOP
        -- Calculate total stock from warehouse movements
        SELECT COALESCE(SUM(
            CASE 
                WHEN movement_type IN ('IN', 'ADJUSTMENT') THEN quantity
                WHEN movement_type IN ('OUT', 'TRANSFER') THEN -quantity
                ELSE 0
            END
        ), 0) INTO warehouse_total
        FROM warehouse_stock_movements 
        WHERE product_id = product_record.id;
        
        -- Update product stock to match warehouse totals
        UPDATE products 
        SET current_stock_quantity = warehouse_total
        WHERE id = product_record.id;
    END LOOP;
END;
$$;

-- Run the sync function
SELECT sync_product_warehouse_stock();