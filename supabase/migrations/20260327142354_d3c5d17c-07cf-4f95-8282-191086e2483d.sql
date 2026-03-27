INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload task attachments"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Anyone can view task attachments"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'task-attachments');

CREATE POLICY "Anyone can delete task attachments"
ON storage.objects FOR DELETE TO anon
USING (bucket_id = 'task-attachments');