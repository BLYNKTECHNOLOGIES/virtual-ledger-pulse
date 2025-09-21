-- Update the existing KYC Process Guide document with new description
UPDATE public.documents 
SET 
  description = 'Updated detailed step-by-step overview of the KYC verification process at Blynk Virtual Technologies Pvt. Ltd. with enhanced Video KYC instructions and improved user interface.',
  updated_at = now()
WHERE title = 'KYC Process Guide';