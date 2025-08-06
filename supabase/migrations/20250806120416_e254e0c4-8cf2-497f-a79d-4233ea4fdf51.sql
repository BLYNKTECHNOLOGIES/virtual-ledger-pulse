-- Add new columns to leads table for enhanced lead management
ALTER TABLE public.leads 
ADD COLUMN lead_type text CHECK (lead_type IN ('BUY', 'SELL')),
ADD COLUMN contact_channel text CHECK (contact_channel IN ('WHATSAPP', 'DIRECT_CALL', 'BINANCE_CHAT')),
ADD COLUMN contact_channel_value text,
ADD COLUMN price_quoted numeric DEFAULT 0,
ADD COLUMN follow_up_date date,
ADD COLUMN follow_up_notes text;

-- Remove the source column as it's being replaced by contact_channel
ALTER TABLE public.leads DROP COLUMN IF EXISTS source;