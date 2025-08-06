-- Add KYC document URL fields to clients table
ALTER TABLE public.clients 
ADD COLUMN pan_card_url text,
ADD COLUMN aadhar_front_url text,
ADD COLUMN aadhar_back_url text,
ADD COLUMN other_documents_urls text[];