
-- Remove category and reorder_level columns from products table
ALTER TABLE public.products 
DROP COLUMN IF EXISTS category,
DROP COLUMN IF EXISTS reorder_level;

-- Add columns to track average prices and purchase history
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS average_buying_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_selling_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_purchases INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sales INTEGER DEFAULT 0;

-- Create function to update average prices when purchase orders are created
CREATE OR REPLACE FUNCTION update_product_average_prices()
RETURNS TRIGGER AS $$
BEGIN
    -- Update average buying price when purchase order items are inserted
    IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'purchase_order_items' THEN
        UPDATE products 
        SET 
            average_buying_price = (
                (COALESCE(average_buying_price, 0) * COALESCE(total_purchases, 0) + NEW.unit_price * NEW.quantity) 
                / (COALESCE(total_purchases, 0) + NEW.quantity)
            ),
            total_purchases = COALESCE(total_purchases, 0) + NEW.quantity,
            current_stock_quantity = current_stock_quantity + NEW.quantity
        WHERE id = NEW.product_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for purchase order items
DROP TRIGGER IF EXISTS trigger_update_average_prices ON purchase_order_items;
CREATE TRIGGER trigger_update_average_prices
    AFTER INSERT ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_product_average_prices();

-- Create warehouse_stock_movements table for tracking warehouse-specific stock movements
CREATE TABLE IF NOT EXISTS public.warehouse_stock_movements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
    quantity INTEGER NOT NULL,
    reference_type TEXT, -- 'PURCHASE_ORDER', 'SALES_ORDER', 'ADJUSTMENT', 'TRANSFER'
    reference_id UUID,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID
);

-- Update stock_adjustments table to be warehouse-specific
ALTER TABLE public.stock_adjustments 
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
