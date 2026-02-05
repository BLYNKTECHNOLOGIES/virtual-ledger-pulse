-- Drop the 15-param version that doesn't have p_created_by to resolve function overloading ambiguity
DROP FUNCTION IF EXISTS create_manual_purchase_complete_v2(
  TEXT, TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, UUID, UUID, TEXT, UUID, TEXT, TEXT, NUMERIC, BOOLEAN
);