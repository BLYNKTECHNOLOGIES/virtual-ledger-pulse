-- Fix search_path syntax: it must be a list of schemas (not a single quoted string)
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
set search_path = public, extensions
as $function$
declare
    v_registration_id uuid;
    v_password_hash text;
begin
    if exists (select 1 from users where username = p_username) then
        raise exception 'Username already exists';
    end if;

    if exists (select 1 from users where email = p_email) then
        raise exception 'Email already exists';
    end if;

    if exists (select 1 from pending_registrations where username = p_username and status = 'pending') then
        raise exception 'A registration request with this username is already pending';
    end if;

    if exists (select 1 from pending_registrations where email = p_email and status = 'pending') then
        raise exception 'A registration request with this email is already pending';
    end if;

    v_password_hash := crypt(p_password, gen_salt('bf'));

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