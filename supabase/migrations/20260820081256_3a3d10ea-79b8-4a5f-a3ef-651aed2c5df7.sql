REVOKE ALL ON public.users FROM authenticated;
REVOKE ALL ON public.users FROM anon;

GRANT SELECT (id, username, email, first_name, last_name, phone, avatar_url, status, email_verified, last_login, failed_login_attempts, account_locked_until, created_at, updated_at, role_id, last_activity, force_logout_at, badge_id, created_by, force_password_change, department_id, position_id) ON public.users TO authenticated;

GRANT INSERT (id, username, email, first_name, last_name, phone, avatar_url, status, email_verified, role_id, badge_id, created_by, force_password_change, department_id, position_id, created_at, updated_at) ON public.users TO authenticated;

GRANT UPDATE (username, email, first_name, last_name, phone, avatar_url, status, email_verified, last_login, failed_login_attempts, account_locked_until, role_id, last_activity, force_logout_at, badge_id, force_password_change, department_id, position_id, updated_at) ON public.users TO authenticated;

GRANT DELETE ON public.users TO authenticated;

GRANT ALL ON public.users TO service_role;