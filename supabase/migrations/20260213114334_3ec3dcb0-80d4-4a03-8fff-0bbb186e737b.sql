
-- Fix: terminal_purchase_sync FK blocks purchase order deletion
-- Change from NO ACTION to CASCADE
ALTER TABLE public.terminal_purchase_sync
  DROP CONSTRAINT terminal_purchase_sync_purchase_order_id_fkey;

ALTER TABLE public.terminal_purchase_sync
  ADD CONSTRAINT terminal_purchase_sync_purchase_order_id_fkey
  FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
