create table if not exists public._mig_role_probe(id int primary key default 1, who text, roles text);
grant all on public._mig_role_probe to service_role;
insert into public._mig_role_probe(id, who, roles) values (1, current_user, (select string_agg(rolname,',') from pg_auth_members m join pg_roles r on r.oid=m.roleid where m.member = (select oid from pg_roles where rolname=current_user)))
on conflict (id) do update set who=excluded.who, roles=excluded.roles;