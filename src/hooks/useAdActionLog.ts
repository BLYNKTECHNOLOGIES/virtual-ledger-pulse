import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// All terminal action types — grouped by category
export const AdActionTypes = {
  // Ads
  AD_CREATED: 'ad.created',
  AD_UPDATED: 'ad.updated',
  AD_STATUS_CHANGED: 'ad.status_changed',
  AD_BULK_STATUS_CHANGED: 'ad.bulk_status_changed',
  AD_BULK_LIMITS_UPDATED: 'ad.bulk_limits_updated',
  AD_BULK_FLOATING_UPDATED: 'ad.bulk_floating_updated',
  AD_REST_STARTED: 'ad.rest_started',
  AD_REST_ENDED: 'ad.rest_ended',
  // Orders
  ORDER_MARKED_PAID: 'order.marked_paid',
  ORDER_RELEASED: 'order.released',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_VERIFIED: 'order.verified',
  // Automations
  AUTO_PAY_TOGGLED: 'automation.auto_pay_toggled',
  AUTO_PAY_MINUTES_CHANGED: 'automation.auto_pay_minutes_changed',
  SMALL_SALES_TOGGLED: 'automation.small_sales_toggled',
  SMALL_SALES_RANGE_CHANGED: 'automation.small_sales_range_changed',
  SMALL_BUYS_TOGGLED: 'automation.small_buys_toggled',
  SMALL_BUYS_RANGE_CHANGED: 'automation.small_buys_range_changed',
  AUTO_REPLY_RULE_CREATED: 'automation.auto_reply_rule_created',
  AUTO_REPLY_RULE_UPDATED: 'automation.auto_reply_rule_updated',
  AUTO_REPLY_RULE_TOGGLED: 'automation.auto_reply_rule_toggled',
  AUTO_REPLY_RULE_DELETED: 'automation.auto_reply_rule_deleted',
  SCHEDULE_CREATED: 'automation.schedule_created',
  SCHEDULE_UPDATED: 'automation.schedule_updated',
  SCHEDULE_TOGGLED: 'automation.schedule_toggled',
  SCHEDULE_DELETED: 'automation.schedule_deleted',
  // Assets
  SPOT_TRADE_EXECUTED: 'asset.spot_trade_executed',
  SPOT_TRADE_FAILED: 'asset.spot_trade_failed',
} as const;

export type AdActionType = typeof AdActionTypes[keyof typeof AdActionTypes];

// Category definitions
export type ActionCategory = 'ads' | 'orders' | 'automations' | 'assets';

export const ACTION_CATEGORIES: Record<ActionCategory, string[]> = {
  ads: [
    AdActionTypes.AD_CREATED, AdActionTypes.AD_UPDATED, AdActionTypes.AD_STATUS_CHANGED,
    AdActionTypes.AD_BULK_STATUS_CHANGED, AdActionTypes.AD_BULK_LIMITS_UPDATED,
    AdActionTypes.AD_BULK_FLOATING_UPDATED, AdActionTypes.AD_REST_STARTED, AdActionTypes.AD_REST_ENDED,
  ],
  orders: [
    AdActionTypes.ORDER_MARKED_PAID, AdActionTypes.ORDER_RELEASED,
    AdActionTypes.ORDER_CANCELLED, AdActionTypes.ORDER_VERIFIED,
  ],
  automations: [
    AdActionTypes.AUTO_PAY_TOGGLED, AdActionTypes.AUTO_PAY_MINUTES_CHANGED,
    AdActionTypes.SMALL_SALES_TOGGLED, AdActionTypes.SMALL_SALES_RANGE_CHANGED,
    AdActionTypes.SMALL_BUYS_TOGGLED, AdActionTypes.SMALL_BUYS_RANGE_CHANGED,
    AdActionTypes.AUTO_REPLY_RULE_CREATED, AdActionTypes.AUTO_REPLY_RULE_UPDATED,
    AdActionTypes.AUTO_REPLY_RULE_TOGGLED, AdActionTypes.AUTO_REPLY_RULE_DELETED,
    AdActionTypes.SCHEDULE_CREATED, AdActionTypes.SCHEDULE_UPDATED,
    AdActionTypes.SCHEDULE_TOGGLED, AdActionTypes.SCHEDULE_DELETED,
  ],
  assets: [
    AdActionTypes.SPOT_TRADE_EXECUTED, AdActionTypes.SPOT_TRADE_FAILED,
  ],
};

export const CATEGORY_LABELS: Record<ActionCategory, string> = {
  ads: 'Ads',
  orders: 'Orders',
  automations: 'Automations',
  assets: 'Assets',
};

export function getActionCategory(actionType: string): ActionCategory | null {
  for (const [cat, types] of Object.entries(ACTION_CATEGORIES)) {
    if (types.includes(actionType)) return cat as ActionCategory;
  }
  return null;
}

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
 * Log a terminal action to the ad_action_logs table.
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
    console.warn('[ActionLog] No user session, skipping log');
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
    if (error) console.error('[ActionLog] Insert failed:', error);
  } catch (err) {
    console.error('[ActionLog] Exception:', err);
  }
}

// Human-readable labels for action types
export function getAdActionLabel(actionType: string): string {
  switch (actionType) {
    // Ads
    case AdActionTypes.AD_CREATED: return 'Ad Created';
    case AdActionTypes.AD_UPDATED: return 'Ad Updated';
    case AdActionTypes.AD_STATUS_CHANGED: return 'Status Changed';
    case AdActionTypes.AD_BULK_STATUS_CHANGED: return 'Bulk Status Changed';
    case AdActionTypes.AD_BULK_LIMITS_UPDATED: return 'Bulk Limits Updated';
    case AdActionTypes.AD_BULK_FLOATING_UPDATED: return 'Bulk Floating Price Updated';
    case AdActionTypes.AD_REST_STARTED: return 'Rest Mode Started';
    case AdActionTypes.AD_REST_ENDED: return 'Rest Mode Ended';
    // Orders
    case AdActionTypes.ORDER_MARKED_PAID: return 'Order Marked Paid';
    case AdActionTypes.ORDER_RELEASED: return 'Order Released';
    case AdActionTypes.ORDER_CANCELLED: return 'Order Cancelled';
    case AdActionTypes.ORDER_VERIFIED: return 'Order Verified';
    // Automations
    case AdActionTypes.AUTO_PAY_TOGGLED: return 'Auto-Pay Toggled';
    case AdActionTypes.AUTO_PAY_MINUTES_CHANGED: return 'Auto-Pay Minutes Changed';
    case AdActionTypes.SMALL_SALES_TOGGLED: return 'Small Sales Toggled';
    case AdActionTypes.SMALL_SALES_RANGE_CHANGED: return 'Small Sales Range Changed';
    case AdActionTypes.SMALL_BUYS_TOGGLED: return 'Small Buys Toggled';
    case AdActionTypes.SMALL_BUYS_RANGE_CHANGED: return 'Small Buys Range Changed';
    case AdActionTypes.AUTO_REPLY_RULE_CREATED: return 'Auto-Reply Rule Created';
    case AdActionTypes.AUTO_REPLY_RULE_UPDATED: return 'Auto-Reply Rule Updated';
    case AdActionTypes.AUTO_REPLY_RULE_TOGGLED: return 'Auto-Reply Rule Toggled';
    case AdActionTypes.AUTO_REPLY_RULE_DELETED: return 'Auto-Reply Rule Deleted';
    case AdActionTypes.SCHEDULE_CREATED: return 'Schedule Created';
    case AdActionTypes.SCHEDULE_UPDATED: return 'Schedule Updated';
    case AdActionTypes.SCHEDULE_TOGGLED: return 'Schedule Toggled';
    case AdActionTypes.SCHEDULE_DELETED: return 'Schedule Deleted';
    // Assets
    case AdActionTypes.SPOT_TRADE_EXECUTED: return 'Spot Trade Executed';
    case AdActionTypes.SPOT_TRADE_FAILED: return 'Spot Trade Failed';
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

export function useAdActionLogs(filters?: { advNo?: string; actionType?: string; category?: ActionCategory; limit?: number }) {
  return useQuery({
    queryKey: ['ad-action-logs', filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('ad_action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 500);

      if (filters?.advNo) {
        query = query.eq('adv_no', filters.advNo);
      }
      if (filters?.actionType) {
        query = query.eq('action_type', filters.actionType);
      }
      if (filters?.category && ACTION_CATEGORIES[filters.category]) {
        query = query.in('action_type', ACTION_CATEGORIES[filters.category]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdActionLogEntry[];
    },
    staleTime: 10_000,
  });
}
