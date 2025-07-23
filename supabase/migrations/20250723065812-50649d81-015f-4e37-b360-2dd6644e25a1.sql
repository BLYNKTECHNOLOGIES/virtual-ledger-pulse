-- Update sales orders to support new payment workflow statuses
DO $$
BEGIN
    -- Add new payment statuses to sales orders if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'sales_orders_payment_status_check'
    ) THEN
        ALTER TABLE sales_orders 
        ADD CONSTRAINT sales_orders_payment_status_check 
        CHECK (payment_status IN ('PENDING', 'USER_PAYING', 'PAYMENT_DONE', 'COMPLETED', 'PARTIAL', 'FAILED', 'ORDER_CANCELLED'));
    ELSE
        -- Drop existing constraint and create new one with additional statuses
        ALTER TABLE sales_orders 
        DROP CONSTRAINT IF EXISTS sales_orders_payment_status_check;
        
        ALTER TABLE sales_orders 
        ADD CONSTRAINT sales_orders_payment_status_check 
        CHECK (payment_status IN ('PENDING', 'USER_PAYING', 'PAYMENT_DONE', 'COMPLETED', 'PARTIAL', 'FAILED', 'ORDER_CANCELLED'));
    END IF;
    
    -- Add sales_payment_method_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales_orders' 
        AND column_name = 'sales_payment_method_id'
    ) THEN
        ALTER TABLE sales_orders 
        ADD COLUMN sales_payment_method_id UUID;
        
        -- Add foreign key constraint to sales_payment_methods
        ALTER TABLE sales_orders 
        ADD CONSTRAINT fk_sales_orders_payment_method 
        FOREIGN KEY (sales_payment_method_id) 
        REFERENCES sales_payment_methods(id);
    END IF;
END
$$;