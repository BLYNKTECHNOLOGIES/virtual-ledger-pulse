
-- Add new columns to sales_orders table for enhanced functionality
ALTER TABLE public.sales_orders 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS attachment_urls TEXT[],
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS risk_level TEXT;

-- Add new columns to clients table for better client management
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS default_risk_level TEXT DEFAULT 'MEDIUM';

-- Create a settings table for system configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default risk level setting
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('default_client_risk_level', 'MEDIUM', 'Default risk level for new clients')
ON CONFLICT (setting_key) DO NOTHING;

-- Create storage bucket for sales attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales_attachments', 'sales_attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for system_settings
CREATE POLICY "Allow all operations on system_settings" ON public.system_settings FOR ALL USING (true);

-- Create policies for storage bucket
CREATE POLICY "Allow all operations on sales_attachments bucket" 
ON storage.objects FOR ALL 
USING (bucket_id = 'sales_attachments');

-- Create function to get default risk level
CREATE OR REPLACE FUNCTION public.get_default_risk_level()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT setting_value FROM public.system_settings WHERE setting_key = 'default_client_risk_level');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing clients without risk_appetite to have default value
UPDATE public.clients 
SET risk_appetite = 'MEDIUM' 
WHERE risk_appetite IS NULL OR risk_appetite = '';
