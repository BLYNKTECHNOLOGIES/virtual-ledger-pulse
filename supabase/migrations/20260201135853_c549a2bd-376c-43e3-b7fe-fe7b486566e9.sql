-- Drop the old function variants and create a single consistent one
DROP FUNCTION IF EXISTS public.reject_registration(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reject_registration(uuid, text);

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
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_registration_id 
      AND status IN ('PENDING', 'pending');  -- Accept both cases
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;