import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/lib/system-action-logger';

// Ad action types
export const AdActionTypes = {
  AD_CREATED: 'ad.created',
  AD_UPDATED: 'ad.updated',
  AD_STATUS_CHANGED: 'ad.status_changed',
  AD_BULK_STATUS_CHANGED: 'ad.bulk_status_changed',
  AD_BULK_LIMITS_UPDATED: 'ad.bulk_limits_updated',
  AD_BULK_FLOATING_UPDATED: 'ad.bulk_floating_updated',
  AD_REST_STARTED: 'ad.rest_started',
  AD_REST_ENDED: 'ad.rest_ended',
} as const;

export type AdActionType = typeof AdActionTypes[keyof typeof AdActionTypes];

function getUserSession(): { userId: string; userName: string } | null {
  try {
    const sessionStr = localStorage.getItem('userSession');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      const userId = session?.user?.id || session?.id || '';
      const userName = session?.user?.username || session?.user?.name || session?.username || 'Unknown';
      if (userId) return { userId, userName };
    }
  } catch {}
  return null;
}

/**
 * Log an ad action to the ad_action_logs table.
 * Non-blocking — errors are swallowed.
 */
export async function logAdAction(params: {
  actionType: AdActionType | string;
  advNo?: string;
  adDetails?: Record<string, any>;
  metadata?: Record<string, any>;
}): Promise<void> {
  const session = getUserSession();
  if (!session) {
    console.warn('[AdActionLog] No user session, skipping log');
    return;
  }

  try {
    const { error } = await supabase
      .from('ad_action_logs' as any)
      .insert({
        user_id: session.userId,
        user_name: session.userName,
        action_type: params.actionType,
        adv_no: params.advNo || null,
        ad_details: params.adDetails || {},
        metadata: params.metadata || {},
      });
    if (error) console.error('[AdActionLog] Insert failed:', error);
  } catch (err) {
    console.error('[AdActionLog] Exception:', err);
  }
}

// Human-readable labels for action types
export function getAdActionLabel(actionType: string): string {
  switch (actionType) {
    case AdActionTypes.AD_CREATED: return 'Ad Created';
    case AdActionTypes.AD_UPDATED: return 'Ad Updated';
    case AdActionTypes.AD_STATUS_CHANGED: return 'Status Changed';
    case AdActionTypes.AD_BULK_STATUS_CHANGED: return 'Bulk Status Changed';
    case AdActionTypes.AD_BULK_LIMITS_UPDATED: return 'Bulk Limits Updated';
    case AdActionTypes.AD_BULK_FLOATING_UPDATED: return 'Bulk Floating Price Updated';
    case AdActionTypes.AD_REST_STARTED: return 'Rest Mode Started';
    case AdActionTypes.AD_REST_ENDED: return 'Rest Mode Ended';
    default: return actionType;
  }
}

export interface AdActionLogEntry {
  id: string;
  user_id: string;
  user_name: string | null;
  action_type: string;
  adv_no: string | null;
  ad_details: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
}

export function useAdActionLogs(filters?: { advNo?: string; actionType?: string; limit?: number }) {
  return useQuery({
    queryKey: ['ad-action-logs', filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('ad_action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 200);

      if (filters?.advNo) {
        query = query.eq('adv_no', filters.advNo);
      }
      if (filters?.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdActionLogEntry[];
    },
    staleTime: 10_000,
  });
}
