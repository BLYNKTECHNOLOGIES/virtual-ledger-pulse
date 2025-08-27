-- Create a function to handle user deletion with proper admin permissions
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete user roles first
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  
  -- Delete user preferences
  DELETE FROM public.user_preferences WHERE user_id = target_user_id;
  
  -- Delete user activity log
  DELETE FROM public.user_activity_log WHERE user_id = target_user_id;
  
  -- Delete password reset tokens
  DELETE FROM public.password_reset_tokens WHERE user_id = target_user_id;
  
  -- Delete email verification tokens
  DELETE FROM public.email_verification_tokens WHERE user_id = target_user_id;
  
  -- Clean up records where user might be referenced as creator/reviewer
  UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.sales_orders SET created_by = NULL WHERE created_by = target_user_id;
  UPDATE public.pending_registrations SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  
  -- Update employee records to remove user_id reference
  UPDATE public.employees SET user_id = NULL WHERE user_id = target_user_id;
  
  -- Finally, delete the user
  DELETE FROM public.users WHERE id = target_user_id;
  
  -- Return success if we get here
  RETURN true;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and return false
    RAISE NOTICE 'Error deleting user %: %', target_user_id, SQLERRM;
    RETURN false;
END;
$$;