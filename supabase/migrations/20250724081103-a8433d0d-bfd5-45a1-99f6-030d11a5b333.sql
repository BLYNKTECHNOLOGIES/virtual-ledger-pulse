-- Create table for user sidebar preferences
CREATE TABLE public.user_sidebar_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sidebar_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint for user_id
ALTER TABLE public.user_sidebar_preferences 
ADD CONSTRAINT unique_user_sidebar_preferences UNIQUE (user_id);

-- Enable Row Level Security
ALTER TABLE public.user_sidebar_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own sidebar preferences" 
ON public.user_sidebar_preferences 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sidebar preferences" 
ON public.user_sidebar_preferences 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sidebar preferences" 
ON public.user_sidebar_preferences 
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_sidebar_preferences_updated_at
BEFORE UPDATE ON public.user_sidebar_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();