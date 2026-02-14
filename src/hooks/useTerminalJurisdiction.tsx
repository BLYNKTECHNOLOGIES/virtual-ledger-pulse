import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

interface OrderAssignment {
  order_number: string;
  assigned_to: string;
  assigned_by: string | null;
  assignment_type: string;
  is_active: boolean;
}

interface EligibleOperator {
  userId: string;
  username: string;
  displayName: string;
  roleName: string;
  specialization: string;
  shift: string | null;
  activeOrderCount: number;
  isActive: boolean;
}

export function useTerminalJurisdiction() {
  const { userId, isTerminalAdmin } = useTerminalAuth();
  const [visibleUserIds, setVisibleUserIds] = useState<Set<string>>(new Set());
  const [orderAssignments, setOrderAssignments] = useState<Map<string, OrderAssignment>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchVisibleUsers = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase.rpc('get_terminal_visible_user_ids', {
        p_user_id: userId,
      });
      if (error) {
        console.error('Error fetching visible users:', error);
        return;
      }
      setVisibleUserIds(new Set((data || []).map((r: any) => r.visible_user_id)));
    } catch (err) {
      console.error('Error in fetchVisibleUsers:', err);
    }
  }, [userId]);

  const fetchOrderAssignments = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('terminal_order_assignments')
        .select('order_number, assigned_to, assigned_by, assignment_type, is_active')
        .eq('is_active', true);

      const map = new Map<string, OrderAssignment>();
      (data || []).forEach(a => map.set(a.order_number, a));
      setOrderAssignments(map);
    } catch (err) {
      console.error('Error fetching order assignments:', err);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchVisibleUsers(), fetchOrderAssignments()]);
    setIsLoading(false);
  }, [fetchVisibleUsers, fetchOrderAssignments]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Check if current user can view an order based on jurisdiction
  const canViewOrder = useCallback((orderNumber: string): boolean => {
    if (isTerminalAdmin) return true;

    const assignment = orderAssignments.get(orderNumber);
    if (!assignment) return true; // Unassigned orders are visible to all in jurisdiction
    return visibleUserIds.has(assignment.assigned_to);
  }, [isTerminalAdmin, orderAssignments, visibleUserIds]);

  // Check if current user can assign an order
  const canAssignOrder = useCallback((orderNumber: string): boolean => {
    if (isTerminalAdmin) return true;

    // Check if user has manage permission (handled by caller)
    // Supervisors can assign orders within their jurisdiction
    return true;
  }, [isTerminalAdmin]);

  // Get assignment info for an order
  const getOrderAssignment = useCallback((orderNumber: string): OrderAssignment | null => {
    return orderAssignments.get(orderNumber) || null;
  }, [orderAssignments]);

  // Determine order visibility category
  const getOrderVisibility = useCallback((orderNumber: string): 'assigned_to_me' | 'assigned_to_team' | 'unassigned' | 'out_of_jurisdiction' => {
    const assignment = orderAssignments.get(orderNumber);
    
    if (!assignment) return 'unassigned';
    if (assignment.assigned_to === userId) return 'assigned_to_me';
    if (visibleUserIds.has(assignment.assigned_to)) return 'assigned_to_team';
    if (isTerminalAdmin) return 'assigned_to_team';
    return 'out_of_jurisdiction';
  }, [orderAssignments, userId, visibleUserIds, isTerminalAdmin]);

  // Assign an order
  const assignOrder = useCallback(async (
    orderNumber: string,
    assignedTo: string,
    tradeType?: string,
    totalPrice?: number,
    asset?: string
  ) => {
    if (!userId) return;
    
    const { error } = await supabase.rpc('assign_terminal_order', {
      p_order_number: orderNumber,
      p_assigned_to: assignedTo,
      p_assigned_by: userId,
      p_assignment_type: 'manual',
      p_trade_type: tradeType || null,
      p_total_price: totalPrice || 0,
      p_asset: asset || 'USDT',
    });
    
    if (error) throw error;
    await fetchOrderAssignments();
  }, [userId, fetchOrderAssignments]);

  // Unassign an order
  const unassignOrder = useCallback(async (orderNumber: string) => {
    if (!userId) return;
    
    const { error } = await supabase.rpc('unassign_terminal_order', {
      p_order_number: orderNumber,
      p_performed_by: userId,
    });
    
    if (error) throw error;
    await fetchOrderAssignments();
  }, [userId, fetchOrderAssignments]);

  // Get eligible operators for assignment (subordinates who are active + mapped)
  const getEligibleOperators = useCallback(async (): Promise<EligibleOperator[]> => {
    if (!userId) return [];

    try {
      const [visibleRes, usersRes, rolesRes, assignmentsRes, profilesRes, userRolesRes] = await Promise.all([
        supabase.rpc('get_terminal_visible_user_ids', { p_user_id: userId }),
        supabase.from('users').select('id, username, first_name, last_name'),
        supabase.from('p2p_terminal_roles').select('id, name, hierarchy_level'),
        supabase.rpc('get_terminal_operator_workloads'),
        supabase.from('terminal_user_profiles').select('user_id, specialization, shift, is_active, automation_included'),
        supabase.from('p2p_terminal_user_roles').select('user_id, role_id'),
      ]);

      const visibleIds = new Set((visibleRes.data || []).map((r: any) => r.visible_user_id));
      const usersMap = new Map<string, any>();
      (usersRes.data || []).forEach(u => usersMap.set(u.id, u));

      const rolesMap = new Map<string, any>();
      (rolesRes.data || []).forEach(r => rolesMap.set(r.id, r));

      const workloadMap = new Map<string, number>();
      (assignmentsRes.data || []).forEach((w: any) => workloadMap.set(w.user_id, Number(w.active_order_count)));

      const profilesMap = new Map<string, any>();
      (profilesRes.data || []).forEach(p => profilesMap.set(p.user_id, p));

      // Find operator-level users (hierarchy_level >= 4 or no level)
      const userRoleMap = new Map<string, any>();
      (userRolesRes.data || []).forEach(ur => {
        const role = rolesMap.get(ur.role_id);
        if (!role) return;
        const existing = userRoleMap.get(ur.user_id);
        if (!existing || (role.hierarchy_level !== null && (existing.hierarchy_level === null || role.hierarchy_level > existing.hierarchy_level))) {
          userRoleMap.set(ur.user_id, role);
        }
      });

      const operators: EligibleOperator[] = [];
      for (const [uid, role] of userRoleMap) {
        if (!visibleIds.has(uid)) continue;
        if (uid === userId && !isTerminalAdmin) continue; // Don't assign to self unless admin
        
        const user = usersMap.get(uid);
        if (!user) continue;
        
        const profile = profilesMap.get(uid);
        if (profile && !profile.is_active) continue;

        operators.push({
          userId: uid,
          username: user.username,
          displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
          roleName: role.name,
          specialization: profile?.specialization || 'both',
          shift: profile?.shift || null,
          activeOrderCount: workloadMap.get(uid) || 0,
          isActive: profile?.is_active !== false,
        });
      }

      // Sort by workload (least first)
      operators.sort((a, b) => a.activeOrderCount - b.activeOrderCount);
      return operators;
    } catch (err) {
      console.error('Error getting eligible operators:', err);
      return [];
    }
  }, [userId, isTerminalAdmin]);

  return {
    visibleUserIds,
    orderAssignments,
    isLoading,
    canViewOrder,
    canAssignOrder,
    getOrderAssignment,
    getOrderVisibility,
    assignOrder,
    unassignOrder,
    getEligibleOperators,
    refetch: fetchAll,
  };
}
