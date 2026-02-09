UPDATE public.users 
SET password_hash = crypt('Admin@123', gen_salt('bf')),
    updated_at = now(),
    force_logout_at = now(),
    failed_login_attempts = 0,
    account_locked_until = NULL
WHERE username = 'Abhishek07';