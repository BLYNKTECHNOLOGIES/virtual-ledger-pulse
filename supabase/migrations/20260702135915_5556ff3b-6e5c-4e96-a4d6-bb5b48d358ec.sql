-- Soft-delete support for client KYC documents.
-- KYC durability rule: files/records are never hard-deleted. A soft-delete hides
-- the document from active views while preserving the row + storage file for audit.

ALTER TABLE public.client_kyc_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE INDEX IF NOT EXISTS idx_client_kyc_documents_active
  ON public.client_kyc_documents (client_id)
  WHERE deleted_at IS NULL;