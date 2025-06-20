
-- Create storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', true);

-- Create storage policies for the kyc-documents bucket
CREATE POLICY "Anyone can view kyc documents" ON storage.objects
FOR SELECT USING (bucket_id = 'kyc-documents');

CREATE POLICY "Anyone can upload kyc documents" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'kyc-documents');

CREATE POLICY "Anyone can update kyc documents" ON storage.objects
FOR UPDATE USING (bucket_id = 'kyc-documents');

CREATE POLICY "Anyone can delete kyc documents" ON storage.objects
FOR DELETE USING (bucket_id = 'kyc-documents');
