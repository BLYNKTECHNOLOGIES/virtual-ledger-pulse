
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchPermissions = async () => {
    if (!user?.id) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_user_permissions', {
        user_uuid: user.id
      });

      if (error) {
        console.error('Error fetching user permissions:', error);
        setPermissions([]);
        return;
      }

      const userPermissions = data?.map((item: any) => item.permission) || [];
      console.log('User permissions from database:', userPermissions);
      setPermissions(userPermissions);
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: string[]): boolean => {
    return permissionList.some(permission => permissions.includes(permission));
  };

  const hasAllPermissions = (permissionList: string[]): boolean => {
    return permissionList.every(permission => permissions.includes(permission));
  };

  useEffect(() => {
    fetchPermissions();
  }, [user?.id]);

  return {
    permissions,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refetchPermissions: fetchPermissions
  };
}
