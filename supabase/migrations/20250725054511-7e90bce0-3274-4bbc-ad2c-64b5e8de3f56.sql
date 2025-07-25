-- Create storage bucket for investigation documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('investigation-documents', 'investigation-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for investigation documents bucket
CREATE POLICY "Anyone can view investigation documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'investigation-documents');

CREATE POLICY "Anyone can upload investigation documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'investigation-documents');

CREATE POLICY "Anyone can update investigation documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'investigation-documents');

-- Add completion_report_url column to investigation_steps table
ALTER TABLE investigation_steps 
ADD COLUMN IF NOT EXISTS completion_report_url TEXT;