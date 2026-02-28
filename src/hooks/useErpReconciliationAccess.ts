import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Checks if the current user has the 'erp_reconciliation' system function
 * assigned via their role. Only users with this function can see the
 * Action Required widget and receive ERP reconciliation notifications.
 */
export function useErpReconciliationAccess() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user?.id) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id);
      if (!isUuid) {
        // Legacy/demo accounts get full access
        setHasAccess(true);
        setIsLoading(false);
        return;
      }

      try {
        // Check erp_reconciliation function permission
        const { data, error } = await supabase
          .rpc('get_user_role_functions', { p_user_id: user.id });

        if (error) {
          console.error('Error checking erp_reconciliation access:', error);
        }

        const functionKeys = (data || []).map((f: any) => f.function_key);
        if (functionKeys.includes('erp_reconciliation')) {
          setHasAccess(true);
          setIsLoading(false);
          return;
        }

        // Also grant access to Admin and Super Admin roles
        const { data: userRoles, error: roleErr } = await supabase
          .from('user_roles')
          .select('role_id, roles:role_id(name)')
          .eq('user_id', user.id);

        if (!roleErr && userRoles) {
          const roleNames = userRoles.map((ur: any) => (ur.roles as any)?.name?.toLowerCase()).filter(Boolean);
          if (roleNames.includes('admin') || roleNames.includes('super admin')) {
            setHasAccess(true);
            setIsLoading(false);
            return;
          }
        }

        setHasAccess(false);
      } catch (err) {
        console.error('Error in useErpReconciliationAccess:', err);
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    check();
  }, [user?.id]);

  return { hasAccess, isLoading };
}
