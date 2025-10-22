-- Create RPC function to update user profile (bypasses RLS securely)
CREATE OR REPLACE FUNCTION update_user_profile(
  p_user_id UUID,
  p_username TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Update only the fields that are provided (not NULL)
  UPDATE users
  SET
    username = COALESCE(p_username, username),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    first_name = COALESCE(p_first_name, first_name),
    last_name = COALESCE(p_last_name, last_name),
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Return the updated user data
  SELECT jsonb_build_object(
    'id', id,
    'username', username,
    'email', email,
    'first_name', first_name,
    'last_name', last_name,
    'avatar_url', avatar_url,
    'updated_at', updated_at
  ) INTO v_result
  FROM users
  WHERE id = p_user_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to public (since we're using custom auth)
GRANT EXECUTE ON FUNCTION update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT) TO public;