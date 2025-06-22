
-- Add last_activity column to users table to track when users were last active
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_activity timestamp with time zone DEFAULT now();

-- Create index for better performance when querying active users
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON public.users(last_activity);

-- Create function to get active users (active within last 5 minutes)
CREATE OR REPLACE FUNCTION get_active_users()
RETURNS TABLE(
  id uuid,
  username text,
  email text,
  first_name text,  
  last_name text,
  last_activity timestamp with time zone,
  status text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.last_activity,
    u.status
  FROM public.users u
  WHERE u.last_activity > now() - interval '5 minutes'
    AND u.status = 'ACTIVE'
  ORDER BY u.last_activity DESC;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_active_users() TO authenticated;

-- Create function to update user activity
CREATE OR REPLACE FUNCTION update_user_activity(user_uuid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users 
  SET last_activity = now()
  WHERE id = user_uuid;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_user_activity(uuid) TO authenticated;
