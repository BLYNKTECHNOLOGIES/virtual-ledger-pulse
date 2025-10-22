-- Create admin function to reset user password
CREATE OR REPLACE FUNCTION admin_reset_user_password(
  user_email TEXT,
  new_password TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update the user's password
  UPDATE users
  SET 
    password_hash = crypt(new_password, gen_salt('bf')),
    updated_at = now()
  WHERE email = user_email;
  
  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (you may want to restrict this further)
GRANT EXECUTE ON FUNCTION admin_reset_user_password TO authenticated, anon;

-- Now reset Shubham's password to "Abhishek"
SELECT admin_reset_user_password('shubhamsuresh2004@gmail.com', 'Abhishek');