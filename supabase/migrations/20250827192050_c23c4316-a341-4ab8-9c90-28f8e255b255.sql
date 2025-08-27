-- Check if investigation-documents bucket exists and create it if not
INSERT INTO storage.buckets (id, name, public)
VALUES ('investigation-documents', 'investigation-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for investigation documents bucket
CREATE POLICY "Allow authenticated users to upload investigation documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'investigation-documents'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to view investigation documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'investigation-documents'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to update investigation documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'investigation-documents'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to delete investigation documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'investigation-documents'
  AND auth.role() = 'authenticated'
);