-- Create the documents storage bucket for payment receipts and other uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to documents bucket
CREATE POLICY "Public Access to documents" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'documents');

-- Allow authenticated users to upload to documents bucket
CREATE POLICY "Allow uploads to documents" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'documents');

-- Allow users to update their own uploads
CREATE POLICY "Allow updates to documents" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'documents');

-- Allow users to delete from documents bucket
CREATE POLICY "Allow deletes from documents" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'documents');