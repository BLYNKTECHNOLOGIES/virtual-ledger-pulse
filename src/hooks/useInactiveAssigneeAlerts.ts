import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds
const OFFLINE_THRESHOLD_MS = 90_000; // 90s without heartbeat = offline

/**
 * This hook runs for any logged-in terminal user. It checks if any user who has
 * an active (is_active=true) payer or operator assignment is offline,
 * and creates notifications for all superiors in the hierarchy tree via
 * SECURITY DEFINER RPCs (to bypass RLS for cross-user notifications).
 * When the user comes back online, it auto-resolves (deactivates) those notifications.
 */
export function useInactiveAssigneeAlerts() {
  const { userId } = useTerminalAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndNotify = useCallback(async () => {
    if (!userId) return;

    try {
      // 1. Get all active payer & operator assignments
      const [payerRes, operatorRes] = await Promise.all([
        supabase
          .from('terminal_payer_assignments')
          .select('payer_user_id')
          .eq('is_active', true),
        supabase
          .from('terminal_operator_assignments' as any)
          .select('operator_user_id')
          .eq('is_active', true),
      ]);

      if (payerRes.error) {
        console.error('[AlertCheck] Failed to fetch payer assignments:', payerRes.error.message);
        return;
      }
      if (operatorRes.error) {
        console.error('[AlertCheck] Failed to fetch operator assignments:', operatorRes.error.message);
        return;
      }

      const assignedUserIds = new Set<string>();
      for (const a of payerRes.data || []) assignedUserIds.add(a.payer_user_id);
      for (const a of (operatorRes.data || []) as any[]) assignedUserIds.add(a.operator_user_id);

      if (assignedUserIds.size === 0) return;

      // 2. Get presence status for all assigned users
      const { data: presenceData, error: presenceError } = await supabase
        .from('terminal_user_presence' as any)
        .select('user_id, is_online, last_seen_at')
        .in('user_id', Array.from(assignedUserIds));

      if (presenceError) {
        console.error('[AlertCheck] Failed to fetch presence:', presenceError.message);
        return;
      }

      const presenceMap = new Map<string, { is_online: boolean; last_seen_at: string }>();
      for (const p of (presenceData || []) as any[]) {
        presenceMap.set(p.user_id, { is_online: p.is_online, last_seen_at: p.last_seen_at });
      }

      // 3. Determine who is offline
      const now = Date.now();
      const offlineUsers = new Set<string>();
      const onlineUsers = new Set<string>();

      for (const uid of assignedUserIds) {
        const presence = presenceMap.get(uid);
        if (!presence) {
          // No presence record = never connected = offline
          offlineUsers.add(uid);
        } else if (!presence.is_online || (now - new Date(presence.last_seen_at).getTime()) > OFFLINE_THRESHOLD_MS) {
          offlineUsers.add(uid);
        } else {
          onlineUsers.add(uid);
        }
      }

      // 4. Get supervisor mappings to find who to notify (BFS ancestors)
      const { data: supervisorMappings, error: supError } = await supabase
        .from('terminal_user_supervisor_mappings')
        .select('user_id, supervisor_id');

      if (supError) {
        console.error('[AlertCheck] Failed to fetch supervisor mappings:', supError.message);
        return;
      }

      const directSupervisors = new Map<string, Set<string>>();
      for (const m of supervisorMappings || []) {
        if (!directSupervisors.has(m.user_id)) directSupervisors.set(m.user_id, new Set());
        directSupervisors.get(m.user_id)!.add(m.supervisor_id);
      }

      function getAncestors(uid: string): Set<string> {
        const ancestors = new Set<string>();
        const queue = [uid];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const sups = directSupervisors.get(current);
          if (sups) {
            for (const s of sups) {
              if (!ancestors.has(s)) {
                ancestors.add(s);
                queue.push(s);
              }
            }
          }
        }
        return ancestors;
      }

      // 5. Get usernames for display
      const allUserIds = [...assignedUserIds];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .in('id', allUserIds);

      const userNameMap = new Map<string, string>();
      for (const u of usersData || []) {
        const name = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username || u.id;
        userNameMap.set(u.id, name);
      }

      // 6. For offline users: create notifications for ancestors via RPC
      for (const offlineUid of offlineUsers) {
        const ancestors = getAncestors(offlineUid);
        if (ancestors.size === 0) continue;

        const displayName = userNameMap.get(offlineUid) || offlineUid.slice(0, 8);

        const payerAssigned = (payerRes.data || []).some(a => a.payer_user_id === offlineUid);
        const operatorAssigned = ((operatorRes.data || []) as any[]).some(a => a.operator_user_id === offlineUid);
        const roles: string[] = [];
        if (payerAssigned) roles.push('Payer');
        if (operatorAssigned) roles.push('Operator');

        for (const ancestorId of ancestors) {
          // Use SECURITY DEFINER RPC (handles dedup internally)
          const { error: rpcErr } = await supabase.rpc('create_inactive_assignee_notification', {
            p_user_id: ancestorId,
            p_title: `${roles.join(' & ')} Inactive`,
            p_message: `${displayName} has active ${roles.join('/')} assignments but is not online in the terminal.`,
            p_related_user_id: offlineUid,
          });
          if (rpcErr) {
            console.error(`[AlertCheck] Failed to create notification for ancestor ${ancestorId}:`, rpcErr.message);
          }
        }
      }

      // 7. For users who came back online: deactivate via RPC
      for (const onlineUid of onlineUsers) {
        const { error: resolveErr } = await supabase.rpc('resolve_inactive_assignee_notifications', {
          p_related_user_id: onlineUid,
        });
        if (resolveErr) {
          console.error(`[AlertCheck] Failed to resolve notifications for ${onlineUid}:`, resolveErr.message);
        }
      }
    } catch (err) {
      console.error('[AlertCheck] Unexpected error:', err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Initial check after a short delay (let presence settle)
    const timeout = setTimeout(checkAndNotify, 10_000);
    intervalRef.current = setInterval(checkAndNotify, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, checkAndNotify]);
}
