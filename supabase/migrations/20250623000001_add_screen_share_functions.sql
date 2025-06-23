
-- Add RPC functions for screen share operations

-- Function to create a screen share request
CREATE OR REPLACE FUNCTION create_screen_share_request(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_admin_username TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_id UUID;
BEGIN
    INSERT INTO screen_share_requests (admin_id, target_user_id, admin_username, status)
    VALUES (p_admin_id, p_target_user_id, p_admin_username, 'pending')
    RETURNING id INTO request_id;
    
    RETURN request_id;
END;
$$;

-- Function to update screen share request status
CREATE OR REPLACE FUNCTION update_screen_share_status(
    p_request_id UUID,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE screen_share_requests 
    SET status = p_status, updated_at = NOW()
    WHERE id = p_request_id;
END;
$$;
