-- Create default warehouses for the existing wallets/exchanges
INSERT INTO warehouses (id, name, location, is_active, created_at, updated_at) VALUES
(gen_random_uuid(), 'BINANCE', 'Exchange Wallet', true, now(), now()),
(gen_random_uuid(), 'BYBIT', 'Exchange Wallet', true, now(), now()),
(gen_random_uuid(), 'BITGET', 'Exchange Wallet', true, now(), now()),
(gen_random_uuid(), 'MAIN_INVENTORY', 'Main Stock Storage', true, now(), now());

-- Get the current USDT product
DO $$
DECLARE
    usdt_product_id uuid;
    main_warehouse_id uuid;
    current_stock numeric;
BEGIN
    -- Get USDT product ID and current stock
    SELECT id, current_stock_quantity INTO usdt_product_id, current_stock
    FROM products 
    WHERE name = 'USDT' 
    LIMIT 1;
    
    -- Get main warehouse ID
    SELECT id INTO main_warehouse_id
    FROM warehouses 
    WHERE name = 'MAIN_INVENTORY' 
    LIMIT 1;
    
    -- Only create movement if we have stock to record and both IDs exist
    IF usdt_product_id IS NOT NULL AND main_warehouse_id IS NOT NULL AND current_stock > 0 THEN
        -- Create initial stock movement for existing stock
        INSERT INTO warehouse_stock_movements (
            id,
            product_id,
            warehouse_id,
            movement_type,
            quantity,
            reference_type,
            reason,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            usdt_product_id,
            main_warehouse_id,
            'IN',
            current_stock,
            'INITIAL_STOCK',
            'Initial stock setup',
            now(),
            now()
        );
    END IF;
END $$;