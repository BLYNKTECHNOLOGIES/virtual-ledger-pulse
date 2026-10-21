create table public.client_tds_certificates (
  id uuid primary key default gen_random_uuid(),
  deductee_pan text not null check (deductee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  deductor_pan text not null,
  form_code text not null,
  quarter text not null check (quarter in ('Q1','Q2','Q3','Q4')),
  tax_year text not null check (tax_year ~ '^[0-9]{4}-[0-9]{2}$'),
  certificate_no text,
  deductee_name text,
  amount_paid numeric,
  tds_amount numeric,
  storage_path text not null unique,
  file_name text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  unique (deductee_pan, deductor_pan, form_code, quarter, tax_year)
);
create index on public.client_tds_certificates (deductee_pan);
grant select, insert, update, delete on public.client_tds_certificates to authenticated;
grant all on public.client_tds_certificates to service_role;
alter table public.client_tds_certificates enable row level security;
create policy "tds certs read" on public.client_tds_certificates for select to authenticated
  using (public.has_permission(auth.uid(),'clients_view') or public.has_permission(auth.uid(),'tax_management_view'));
create policy "tds certs insert" on public.client_tds_certificates for insert to authenticated
  with check (public.has_permission(auth.uid(),'tax_management_manage'));
create policy "tds certs update" on public.client_tds_certificates for update to authenticated
  using (public.has_permission(auth.uid(),'tax_management_manage')) with check (public.has_permission(auth.uid(),'tax_management_manage'));
create policy "tds certs delete" on public.client_tds_certificates for delete to authenticated
  using (public.has_permission(auth.uid(),'tax_management_manage'));
create policy "tds cert files read" on storage.objects for select to authenticated
  using (bucket_id='tds-certificates' and (public.has_permission(auth.uid(),'clients_view') or public.has_permission(auth.uid(),'tax_management_view')));
create policy "tds cert files insert" on storage.objects for insert to authenticated
  with check (bucket_id='tds-certificates' and public.has_permission(auth.uid(),'tax_management_manage'));
create policy "tds cert files update" on storage.objects for update to authenticated
  using (bucket_id='tds-certificates' and public.has_permission(auth.uid(),'tax_management_manage'));
create policy "tds cert files delete" on storage.objects for delete to authenticated
  using (bucket_id='tds-certificates' and public.has_permission(auth.uid(),'tax_management_manage'));