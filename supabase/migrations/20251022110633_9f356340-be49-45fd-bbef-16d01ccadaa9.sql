-- Add created_by field to track employees who create entries

-- Add created_by to sales_orders if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales_orders' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE sales_orders ADD COLUMN created_by UUID REFERENCES users(id);
        CREATE INDEX idx_sales_orders_created_by ON sales_orders(created_by);
    END IF;
END $$;

-- Add created_by to purchase_orders if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_orders' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN created_by UUID REFERENCES users(id);
        CREATE INDEX idx_purchase_orders_created_by ON purchase_orders(created_by);
    END IF;
END $$;

-- Add created_by to bank_transactions if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bank_transactions' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE bank_transactions ADD COLUMN created_by UUID REFERENCES users(id);
        CREATE INDEX idx_bank_transactions_created_by ON bank_transactions(created_by);
    END IF;
END $$;

-- Add created_by to journal_entries if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'journal_entries' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN created_by UUID REFERENCES users(id);
        CREATE INDEX idx_journal_entries_created_by ON journal_entries(created_by);
    END IF;
END $$;

-- Add created_by to stock_transactions if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_transactions') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'stock_transactions' AND column_name = 'created_by'
        ) THEN
            ALTER TABLE stock_transactions ADD COLUMN created_by UUID REFERENCES users(id);
            CREATE INDEX idx_stock_transactions_created_by ON stock_transactions(created_by);
        END IF;
    END IF;
END $$;