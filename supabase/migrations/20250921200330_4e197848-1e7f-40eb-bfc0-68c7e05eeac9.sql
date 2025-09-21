-- Create documents table for storing PDF files and other documents
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  file_size BIGINT,
  category TEXT DEFAULT 'general',
  is_public BOOLEAN DEFAULT true,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create policies for public access to documents
CREATE POLICY "Anyone can view public documents" 
ON public.documents 
FOR SELECT 
USING (is_public = true);

CREATE POLICY "Authenticated users can manage documents" 
ON public.documents 
FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Insert the KYC Process Guide document
INSERT INTO public.documents (
  title,
  description,
  file_path,
  file_type,
  category,
  is_public
) VALUES (
  'KYC Process Guide',
  'Detailed step-by-step overview of the KYC verification process at Blynk Virtual Technologies Pvt. Ltd.',
  '/documents/KYC-Process-Guide.pdf',
  'pdf',
  'kyc',
  true
);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();