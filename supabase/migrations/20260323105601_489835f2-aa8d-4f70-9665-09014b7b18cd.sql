-- Add bill_url column to bank_transactions
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS bill_url text;

-- Create storage bucket for transaction bills
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transaction-bills',
  'transaction-bills',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated uploads
CREATE POLICY "Allow authenticated uploads to transaction-bills"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'transaction-bills');

-- Allow public reads
CREATE POLICY "Allow public reads on transaction-bills"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'transaction-bills');