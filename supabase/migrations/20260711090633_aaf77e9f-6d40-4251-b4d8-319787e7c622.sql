-- Remove blanket column access and re-grant every column EXCEPT password_hash
REVOKE SELECT ON public.users FROM authenticated;
REVOKE SELECT ON public.users FROM anon;

GRANT SELECT (
  id, username, email, first_name, last_name, phone, avatar_url, status,
  email_verified, last_login, failed_login_attempts, account_locked_until,
  created_at, updated_at, role_id, last_activity, force_logout_at, badge_id,
  created_by, force_password_change, department_id, position_id
) ON public.users TO authenticated;