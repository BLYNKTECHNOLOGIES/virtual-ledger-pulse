-- Ensure pgcrypto exists (Supabase typically installs extensions in the `extensions` schema)
create extension if not exists pgcrypto with schema extensions;

-- Fix registration RPC: it sets search_path to public, so it can't see extensions.gen_salt()
create or replace function public.register_user_request(
  p_first_name text,
  p_last_name text,
  p_username text,
  p_email text,
  p_phone text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
    v_registration_id uuid;
    v_password_hash text;
begin
    -- Check if username already exists in users table
    if exists (select 1 from users where username = p_username) then
        raise exception 'Username already exists';
    end if;

    -- Check if email already exists in users table
    if exists (select 1 from users where email = p_email) then
        raise exception 'Email already exists';
    end if;

    -- Check if username already exists in pending registrations
    if exists (select 1 from pending_registrations where username = p_username and status = 'pending') then
        raise exception 'A registration request with this username is already pending';
    end if;

    -- Check if email already exists in pending registrations
    if exists (select 1 from pending_registrations where email = p_email and status = 'pending') then
        raise exception 'A registration request with this email is already pending';
    end if;

    -- Hash the password
    v_password_hash := crypt(p_password, gen_salt('bf'));

    -- Insert the registration request
    insert into pending_registrations (
        first_name,
        last_name,
        username,
        email,
        phone,
        password_hash
    ) values (
        p_first_name,
        p_last_name,
        p_username,
        p_email,
        p_phone,
        v_password_hash
    ) returning id into v_registration_id;

    return v_registration_id;
end;
$function$;