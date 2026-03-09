
-- =====================================================
-- Phase 1: Clean up overloaded database functions
-- Drop old signatures, keep only the ones the frontend uses
-- =====================================================

-- 1. reconcile_purchase_order_edit: Drop 2 old signatures
-- Keep: (p_order_id, p_order_number, p_order_date, p_supplier_name, ..., p_payment_splits jsonb)
DROP FUNCTION IF EXISTS public.reconcile_purchase_order_edit(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, uuid, uuid, uuid, text, date, boolean, numeric
);

DROP FUNCTION IF EXISTS public.reconcile_purchase_order_edit(
  uuid, text, date, text, uuid, uuid, numeric, numeric, uuid, uuid, numeric, numeric, boolean, numeric, text
);

-- 2. reconcile_sales_order_edit: Drop 2 old signatures
-- Keep: (p_order_id, p_order_number, p_old_total_amount, p_new_total_amount, ..., p_product_code text) OID 268832
DROP FUNCTION IF EXISTS public.reconcile_sales_order_edit(
  uuid, text, numeric, numeric, numeric, numeric, uuid, uuid, uuid, text, date, boolean, numeric
);

DROP FUNCTION IF EXISTS public.reconcile_sales_order_edit(
  uuid, text, date, text, uuid, numeric, numeric, uuid, uuid, numeric, numeric, boolean, numeric, text
);

-- 3. admin_reset_user_password: Drop old email-based signature
-- Keep: (p_user_id uuid, p_new_password text)
DROP FUNCTION IF EXISTS public.admin_reset_user_password(text, text);

-- 4. get_user_permissions: Drop old text-based signature
-- Keep: (user_uuid uuid)
DROP FUNCTION IF EXISTS public.get_user_permissions(text);

-- 5. user_has_permission: Drop old text-based signature
-- Keep: (user_uuid uuid, check_permission app_permission)
DROP FUNCTION IF EXISTS public.user_has_permission(text, app_permission);

-- 6. reverse_payment_gateway_settlement: Drop old single-param signature
-- Keep: (p_settlement_id uuid, p_reversed_by uuid)
DROP FUNCTION IF EXISTS public.reverse_payment_gateway_settlement(uuid);

-- =====================================================
-- Phase 1: Add CHECK constraint on bank_transactions.transaction_type
-- to prevent future silent type mismatches
-- =====================================================
ALTER TABLE public.bank_transactions 
ADD CONSTRAINT bank_transactions_valid_type 
CHECK (transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER_IN', 'TRANSFER_OUT'));
