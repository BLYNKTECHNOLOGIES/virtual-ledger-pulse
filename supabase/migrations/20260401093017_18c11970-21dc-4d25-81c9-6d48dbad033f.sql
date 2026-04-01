
INSERT INTO role_permissions (role_id, permission)
SELECT 'bcdf7ebb-c22c-49ee-8505-3eb7c0b32a3a', p.perm
FROM (VALUES ('terminal_view'::app_permission), ('terminal_manage'::app_permission)) AS p(perm)
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions 
  WHERE role_id = 'bcdf7ebb-c22c-49ee-8505-3eb7c0b32a3a' AND permission = p.perm
);
