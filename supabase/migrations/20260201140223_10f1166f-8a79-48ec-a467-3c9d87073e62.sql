-- Fix the reject_registration function - remove updated_at reference
CREATE OR REPLACE FUNCTION public.reject_registration(
    p_registration_id uuid,
    p_rejected_by uuid DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE pending_registrations
    SET 
        status = 'REJECTED',
        rejection_reason = p_reason,
        reviewed_by = p_rejected_by,
        reviewed_at = now()
    WHERE id = p_registration_id 
      AND status IN ('PENDING', 'pending');
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;