
-- Reassign terminal_sales_sync references from duplicates to master
WITH duplicates AS (
  SELECT 
    UPPER(name) as uname,
    (array_agg(id ORDER BY created_at ASC))[1] as master_id,
    array_remove(array_agg(id ORDER BY created_at ASC), (array_agg(id ORDER BY created_at ASC))[1]) as dup_ids
  FROM clients
  GROUP BY UPPER(name)
  HAVING count(*) > 1
)
UPDATE terminal_sales_sync tss
SET client_id = d.master_id
FROM duplicates d
WHERE tss.client_id = ANY(d.dup_ids);

-- Reassign terminal_purchase_sync references
WITH duplicates AS (
  SELECT 
    UPPER(name) as uname,
    (array_agg(id ORDER BY created_at ASC))[1] as master_id,
    array_remove(array_agg(id ORDER BY created_at ASC), (array_agg(id ORDER BY created_at ASC))[1]) as dup_ids
  FROM clients
  GROUP BY UPPER(name)
  HAVING count(*) > 1
)
UPDATE terminal_purchase_sync tps
SET client_id = d.master_id
FROM duplicates d
WHERE tps.client_id = ANY(d.dup_ids);

-- Merge useful data from duplicates into master
WITH duplicates AS (
  SELECT 
    UPPER(name) as uname,
    (array_agg(id ORDER BY created_at ASC))[1] as master_id,
    array_remove(array_agg(id ORDER BY created_at ASC), (array_agg(id ORDER BY created_at ASC))[1]) as dup_ids
  FROM clients
  GROUP BY UPPER(name)
  HAVING count(*) > 1
),
best_dup_data AS (
  SELECT DISTINCT ON (d.master_id)
    d.master_id,
    c.phone,
    c.state,
    c.pan_card_number
  FROM clients c
  JOIN duplicates d ON c.id = ANY(d.dup_ids)
  WHERE c.phone IS NOT NULL OR c.state IS NOT NULL OR c.pan_card_number IS NOT NULL
  ORDER BY d.master_id, c.phone IS NOT NULL DESC, c.state IS NOT NULL DESC, c.created_at ASC
)
UPDATE clients master
SET 
  phone = COALESCE(master.phone, bd.phone),
  state = COALESCE(master.state, bd.state),
  pan_card_number = COALESCE(master.pan_card_number, bd.pan_card_number)
FROM best_dup_data bd
WHERE master.id = bd.master_id;

-- Soft-delete all duplicate records (keep oldest master)
WITH duplicates AS (
  SELECT 
    UPPER(name) as uname,
    (array_agg(id ORDER BY created_at ASC))[1] as master_id,
    array_remove(array_agg(id ORDER BY created_at ASC), (array_agg(id ORDER BY created_at ASC))[1]) as dup_ids
  FROM clients
  GROUP BY UPPER(name)
  HAVING count(*) > 1
)
UPDATE clients 
SET is_deleted = true, deleted_at = now()
WHERE id IN (SELECT unnest(dup_ids) FROM duplicates);

-- Create unique index on UPPER(name) for non-deleted clients to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_name_active 
ON clients (UPPER(name)) 
WHERE is_deleted = false;
