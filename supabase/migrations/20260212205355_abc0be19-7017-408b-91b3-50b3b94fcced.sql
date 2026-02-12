
-- Deduplicate clients: keep the oldest record per name, soft-delete the rest
-- Step 1: Reassign terminal_sales_sync references to the master (oldest) client
WITH duplicates AS (
  SELECT 
    id,
    LOWER(TRIM(name)) as norm_name,
    ROW_NUMBER() OVER(PARTITION BY LOWER(TRIM(name)) ORDER BY created_at ASC) as rn
  FROM clients
  WHERE is_deleted = false
),
masters AS (
  SELECT id as master_id, norm_name FROM duplicates WHERE rn = 1
),
dupes AS (
  SELECT d.id as dupe_id, m.master_id 
  FROM duplicates d
  JOIN masters m ON d.norm_name = m.norm_name
  WHERE d.rn > 1
)
UPDATE terminal_sales_sync 
SET client_id = dupes.master_id
FROM dupes
WHERE terminal_sales_sync.client_id = dupes.dupe_id;

-- Step 2: Reassign terminal_purchase_sync references if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'terminal_purchase_sync') THEN
    EXECUTE '
      WITH duplicates AS (
        SELECT id, LOWER(TRIM(name)) as norm_name,
          ROW_NUMBER() OVER(PARTITION BY LOWER(TRIM(name)) ORDER BY created_at ASC) as rn
        FROM clients WHERE is_deleted = false
      ),
      masters AS (SELECT id as master_id, norm_name FROM duplicates WHERE rn = 1),
      dupes AS (SELECT d.id as dupe_id, m.master_id FROM duplicates d JOIN masters m ON d.norm_name = m.norm_name WHERE d.rn > 1)
      UPDATE terminal_purchase_sync SET client_id = dupes.master_id FROM dupes WHERE terminal_purchase_sync.client_id = dupes.dupe_id;
    ';
  END IF;
END $$;

-- Step 3: Soft-delete all duplicate clients (keep the oldest per name)
WITH duplicates AS (
  SELECT 
    id,
    LOWER(TRIM(name)) as norm_name,
    ROW_NUMBER() OVER(PARTITION BY LOWER(TRIM(name)) ORDER BY created_at ASC) as rn
  FROM clients
  WHERE is_deleted = false
)
UPDATE clients
SET is_deleted = true, deleted_at = now()
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
