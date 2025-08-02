-- Clear existing warehouse stock movements for USDT to start fresh
DELETE FROM warehouse_stock_movements 
WHERE product_id = (SELECT id FROM products WHERE code = 'USDT');

-- Get the actual wallet balances and create corresponding warehouse movements
-- BINANCE AS: 29.83 -> BINANCE warehouse
INSERT INTO warehouse_stock_movements (
    product_id, 
    warehouse_id, 
    movement_type, 
    quantity, 
    reference_type, 
    reason,
    created_at
) VALUES 
(
    (SELECT id FROM products WHERE code = 'USDT'),
    (SELECT id FROM warehouses WHERE name = 'BINANCE'),
    'IN',
    29.83366067,
    'WALLET_RECONCILIATION',
    'BINANCE AS wallet balance',
    now()
);

-- BINANCE BLYNK: 220.10 -> BINANCE warehouse  
INSERT INTO warehouse_stock_movements (
    product_id, 
    warehouse_id, 
    movement_type, 
    quantity, 
    reference_type, 
    reason,
    created_at
) VALUES 
(
    (SELECT id FROM products WHERE code = 'USDT'),
    (SELECT id FROM warehouses WHERE name = 'BINANCE'),
    'IN',
    220.10415038,
    'WALLET_RECONCILIATION',
    'BINANCE BLYNK wallet balance',
    now()
);

-- BINANCE SS: 252.64 -> BINANCE warehouse
INSERT INTO warehouse_stock_movements (
    product_id, 
    warehouse_id, 
    movement_type, 
    quantity, 
    reference_type, 
    reason,
    created_at
) VALUES 
(
    (SELECT id FROM products WHERE code = 'USDT'),
    (SELECT id FROM warehouses WHERE name = 'BINANCE'),
    'IN',
    252.64,
    'WALLET_RECONCILIATION',
    'BINANCE SS wallet balance',
    now()
);

-- BINANCE VERTEX: 222.24 -> BINANCE warehouse
INSERT INTO warehouse_stock_movements (
    product_id, 
    warehouse_id, 
    movement_type, 
    quantity, 
    reference_type, 
    reason,
    created_at
) VALUES 
(
    (SELECT id FROM products WHERE code = 'USDT'),
    (SELECT id FROM warehouses WHERE name = 'BINANCE'),
    'IN',
    222.23591194,
    'WALLET_RECONCILIATION',
    'BINANCE VERTEX wallet balance',
    now()
);

-- BITGET SS: 62.93 -> BITGET warehouse
INSERT INTO warehouse_stock_movements (
    product_id, 
    warehouse_id, 
    movement_type, 
    quantity, 
    reference_type, 
    reason,
    created_at
) VALUES 
(
    (SELECT id FROM products WHERE code = 'USDT'),
    (SELECT id FROM warehouses WHERE name = 'BITGET'),
    'IN',
    62.92993327,
    'WALLET_RECONCILIATION',
    'BITGET SS wallet balance',
    now()
);

-- BYBIT AS: 91.47 -> BYBIT warehouse
INSERT INTO warehouse_stock_movements (
    product_id, 
    warehouse_id, 
    movement_type, 
    quantity, 
    reference_type, 
    reason,
    created_at
) VALUES 
(
    (SELECT id FROM products WHERE code = 'USDT'),
    (SELECT id FROM warehouses WHERE name = 'BYBIT'),
    'IN',
    91.47,
    'WALLET_RECONCILIATION',
    'BYBIT AS wallet balance',
    now()
);

-- Update the product stock to match the actual total
UPDATE products 
SET current_stock_quantity = 879.21365626,
    updated_at = now()
WHERE code = 'USDT';

-- Sync the stock using the RPC function
SELECT sync_product_warehouse_stock();