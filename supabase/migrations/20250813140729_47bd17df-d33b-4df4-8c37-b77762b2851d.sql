-- Check what triggers exist and remove the problematic one causing double deduction
-- First, let's see what triggers are on the tables

SELECT 
  schemaname,
  tablename,
  triggers
FROM pg_tables t
LEFT JOIN (
  SELECT 
    schemaname,
    tablename,
    array_agg(triggername) as triggers
  FROM pg_trigger tr
  JOIN pg_class c ON tr.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE NOT tr.tgisinternal
  GROUP BY schemaname, tablename
) trig ON t.schemaname = trig.schemaname AND t.tablename = trig.tablename
WHERE t.tablename IN ('bank_transactions', 'purchase_orders')
AND t.schemaname = 'public';

-- Also check the specific functions that might be causing issues
\df+ *purchase*
\df+ *bank*