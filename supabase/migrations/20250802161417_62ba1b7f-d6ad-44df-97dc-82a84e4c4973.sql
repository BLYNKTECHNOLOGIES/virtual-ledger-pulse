-- Add some initial stock to demonstrate the system
DO $$
DECLARE
    usdt_product_id uuid;
    main_warehouse_id uuid;
    binance_warehouse_id uuid;
BEGIN
    -- Get USDT product ID
    SELECT id INTO usdt_product_id FROM products WHERE name = 'USDT' LIMIT 1;
    
    -- Get warehouse IDs
    SELECT id INTO main_warehouse_id FROM warehouses WHERE name = 'MAIN_INVENTORY' LIMIT 1;
    SELECT id INTO binance_warehouse_id FROM warehouses WHERE name = 'BINANCE' LIMIT 1;
    
    -- Create initial stock movements to populate the system
    IF usdt_product_id IS NOT NULL AND main_warehouse_id IS NOT NULL THEN
        -- Add 1000 USDT to main inventory
        INSERT INTO warehouse_stock_movements (
            id, product_id, warehouse_id, movement_type, quantity, 
            reference_type, reason, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), usdt_product_id, main_warehouse_id, 'IN', 1000,
            'INITIAL_STOCK', 'Initial inventory setup', now(), now()
        );
        
        -- Add 500 USDT to Binance warehouse
        INSERT INTO warehouse_stock_movements (
            id, product_id, warehouse_id, movement_type, quantity,
            reference_type, reason, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), usdt_product_id, binance_warehouse_id, 'IN', 500,
            'INITIAL_STOCK', 'Binance exchange allocation', now(), now()
        );
    END IF;
END $$;