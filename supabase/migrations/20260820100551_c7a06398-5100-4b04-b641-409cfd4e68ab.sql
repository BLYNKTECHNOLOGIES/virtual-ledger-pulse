-- ============================================================
-- 1. Storage: authenticated-only policies for sensitive buckets
-- ============================================================
DROP POLICY IF EXISTS "Allow all operations on sales_attachments bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to transaction-bills" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletion of employee-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from internal-chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from internal-chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads on transaction-bills" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to internal-chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to employee-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to employee-documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow viewing of employee-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete kyc documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update kyc documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload kyc documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view investigation documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view kyc documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view employee documents" ON storage.objects;

DROP POLICY IF EXISTS "sensitive_docs_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "sensitive_docs_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "sensitive_docs_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "sensitive_docs_authenticated_delete" ON storage.objects;

CREATE POLICY "sensitive_docs_authenticated_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'));

CREATE POLICY "sensitive_docs_authenticated_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'));

CREATE POLICY "sensitive_docs_authenticated_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'))
WITH CHECK (bucket_id IN ('kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'));

CREATE POLICY "sensitive_docs_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'));

-- ============================================================
-- 2. users.password_hash must never be readable by app roles
-- ============================================================
REVOKE SELECT (password_hash) ON public.users FROM authenticated;
REVOKE SELECT (password_hash) ON public.users FROM anon;
REVOKE UPDATE (password_hash) ON public.users FROM authenticated;
REVOKE UPDATE (password_hash) ON public.users FROM anon;

-- ============================================================
-- 3. WebAuthn SECURITY DEFINER functions: scope to the caller
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_webauthn_credentials(p_user_id uuid)
RETURNS TABLE(id uuid, credential_id text, public_key text, sign_count integer, device_name text, created_at timestamptz, last_used_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id
     AND NOT public.has_role(auth.uid(), 'Super Admin')
     AND NOT public.has_role(auth.uid(), 'Admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT c.id, c.credential_id, c.public_key, c.sign_count, c.device_name, c.created_at, c.last_used_at
  FROM public.terminal_webauthn_credentials c
  WHERE c.user_id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.store_webauthn_credential(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.store_webauthn_credential(p_user_id uuid, p_credential_id text, p_public_key text, p_device_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id
     AND NOT public.has_role(auth.uid(), 'Super Admin')
     AND NOT public.has_role(auth.uid(), 'Admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.terminal_webauthn_credentials (user_id, credential_id, public_key, device_name)
  VALUES (p_user_id, p_credential_id, p_public_key, p_device_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_all_user_webauthn_credentials(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id
     AND NOT public.has_role(auth.uid(), 'Super Admin')
     AND NOT public.has_role(auth.uid(), 'Admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  UPDATE public.terminal_biometric_sessions SET is_active = false WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_webauthn_credential(p_credential_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_owner
     AND NOT public.has_role(auth.uid(), 'Super Admin')
     AND NOT public.has_role(auth.uid(), 'Admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.terminal_webauthn_credentials WHERE id = p_credential_id;
END;
$$;