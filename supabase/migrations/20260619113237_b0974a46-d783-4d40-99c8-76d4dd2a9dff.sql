-- Add department/position to users (assigned at approval)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.positions(id);

-- Track badge id and the created auth user on pending registrations
ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS badge_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Replace approve_registration: now assigns role + department + position.
-- For registrations created by the new self-registration flow the auth user
-- already exists (linked via user_id) and is simply activated. Legacy rows
-- without a user_id fall back to the historic direct-insert behavior.
DROP FUNCTION IF EXISTS public.approve_registration(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.approve_registration(
  p_registration_id uuid,
  p_role_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_position_id uuid DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_registration RECORD;
    v_user_id UUID;
BEGIN
    SELECT * INTO v_registration
    FROM pending_registrations
    WHERE id = p_registration_id
      AND status IN ('PENDING', 'pending');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration not found or already processed';
    END IF;

    IF v_registration.user_id IS NOT NULL THEN
        -- New flow: activate the already-created auth user
        UPDATE users
        SET status = 'ACTIVE',
            role_id = p_role_id,
            department_id = p_department_id,
            position_id = p_position_id,
            badge_id = COALESCE(v_registration.badge_id, badge_id),
            updated_at = now()
        WHERE id = v_registration.user_id;
        v_user_id := v_registration.user_id;
    ELSE
        -- Legacy flow: create the public.users record directly
        INSERT INTO users (
            username, email, first_name, last_name, phone,
            password_hash, status, role_id, department_id, position_id,
            badge_id, created_at, updated_at
        ) VALUES (
            v_registration.username, v_registration.email,
            v_registration.first_name, v_registration.last_name,
            v_registration.phone, v_registration.password_hash,
            'ACTIVE', p_role_id, p_department_id, p_position_id,
            v_registration.badge_id, now(), now()
        ) RETURNING id INTO v_user_id;
    END IF;

    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_user_id, p_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    UPDATE pending_registrations
    SET status = 'APPROVED',
        reviewed_by = p_approved_by,
        reviewed_at = now()
    WHERE id = p_registration_id;

    RETURN v_user_id;
END;
$function$;