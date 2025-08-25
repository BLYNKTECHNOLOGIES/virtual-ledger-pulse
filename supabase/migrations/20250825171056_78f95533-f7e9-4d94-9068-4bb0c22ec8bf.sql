-- Create storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for employee documents storage
CREATE POLICY "Users can upload employee documents" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'employee-documents' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can view employee documents" ON storage.objects
FOR SELECT USING (
  bucket_id = 'employee-documents' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can update employee documents" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'employee-documents' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete employee documents" ON storage.objects
FOR DELETE USING (
  bucket_id = 'employee-documents' AND
  auth.role() = 'authenticated'
);