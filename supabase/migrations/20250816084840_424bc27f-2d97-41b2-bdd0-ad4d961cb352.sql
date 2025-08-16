-- Add follow-up time column to leads table
ALTER TABLE public.leads ADD COLUMN follow_up_time time DEFAULT NULL;

-- Create index for efficient sorting by follow-up datetime
CREATE INDEX idx_leads_follow_up_datetime ON public.leads(follow_up_date, follow_up_time) WHERE follow_up_date IS NOT NULL;