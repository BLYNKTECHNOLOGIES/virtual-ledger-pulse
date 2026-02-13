
-- Restore ALLTRIN master record (both were deleted, need to keep one)
UPDATE clients SET is_deleted = false, deleted_at = null 
WHERE id = 'f55773dd-b94d-40b3-b533-17bcf5d8803d';
