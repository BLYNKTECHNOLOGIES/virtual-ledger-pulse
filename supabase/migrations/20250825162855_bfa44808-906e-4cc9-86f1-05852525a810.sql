-- Create storage bucket for investigation documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('investigation-documents', 'investigation-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for investigation documents
CREATE POLICY "Anyone can view investigation documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'investigation-documents');

CREATE POLICY "Authenticated users can upload investigation documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'investigation-documents');

CREATE POLICY "Authenticated users can update investigation documents" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'investigation-documents');

CREATE POLICY "Authenticated users can delete investigation documents" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'investigation-documents');