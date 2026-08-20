DROP POLICY IF EXISTS "Public can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "avatars_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_permission(auth.uid(), 'super_admin_access')
    OR public.has_permission(auth.uid(), 'admin_access')
  )
);

CREATE POLICY "avatars_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_permission(auth.uid(), 'super_admin_access')
    OR public.has_permission(auth.uid(), 'admin_access')
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_permission(auth.uid(), 'super_admin_access')
    OR public.has_permission(auth.uid(), 'admin_access')
  )
);

CREATE POLICY "avatars_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_permission(auth.uid(), 'super_admin_access')
    OR public.has_permission(auth.uid(), 'admin_access')
  )
);