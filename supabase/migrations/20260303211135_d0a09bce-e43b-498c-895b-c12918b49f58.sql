
-- Merge kanakurthi amani (Q75L0C, 9749f134) INTO Kanakruti Amani (MOW4IK, a125949f)

-- 1. Update all purchase_orders referencing old client name to new canonical name
UPDATE public.purchase_orders 
SET supplier_name = 'Kanakruti Amani'
WHERE LOWER(supplier_name) = 'kanakurthi amani';

-- 2. Update terminal_purchase_sync records pointing to old client
UPDATE public.terminal_purchase_sync 
SET client_id = 'a125949f-6b67-477c-b8dc-0d052f943435'
WHERE client_id = '9749f134-cbec-4424-8429-f53a3ce18a82';

-- 3. Soft-delete the duplicate client
UPDATE public.clients 
SET is_deleted = true, deleted_at = now()
WHERE id = '9749f134-cbec-4424-8429-f53a3ce18a82';
