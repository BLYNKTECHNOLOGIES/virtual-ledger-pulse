-- Add foreign key constraints to pending_settlements table
ALTER TABLE public.pending_settlements 
ADD CONSTRAINT fk_pending_settlements_sales_order 
FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;

ALTER TABLE public.pending_settlements 
ADD CONSTRAINT fk_pending_settlements_payment_method 
FOREIGN KEY (payment_method_id) REFERENCES public.sales_payment_methods(id) ON DELETE SET NULL;

ALTER TABLE public.pending_settlements 
ADD CONSTRAINT fk_pending_settlements_bank_account 
FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;