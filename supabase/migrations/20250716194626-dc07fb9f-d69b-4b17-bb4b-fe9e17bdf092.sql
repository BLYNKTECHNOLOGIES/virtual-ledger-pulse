-- Add min_limit and max_limit columns to sales_payment_methods table
ALTER TABLE sales_payment_methods 
ADD COLUMN min_limit numeric NOT NULL DEFAULT 200,
ADD COLUMN max_limit numeric NOT NULL DEFAULT 10000000;

-- Add constraints to prevent negative values
ALTER TABLE sales_payment_methods 
ADD CONSTRAINT check_sales_payment_limit_positive CHECK (payment_limit >= 0),
ADD CONSTRAINT check_sales_current_usage_positive CHECK (current_usage >= 0),
ADD CONSTRAINT check_sales_min_limit_positive CHECK (min_limit >= 200),
ADD CONSTRAINT check_sales_max_limit_positive CHECK (max_limit >= 200),
ADD CONSTRAINT check_sales_min_max_limit_order CHECK (min_limit <= max_limit);