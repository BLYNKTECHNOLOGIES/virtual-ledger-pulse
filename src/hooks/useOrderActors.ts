import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Actor information for a specific action on an order
 */
export interface OrderActor {
  actionType: string;
  actionLabel: string;
  actorRole: string;
  actorUserId: string | null;
  actorName: string;
  recordedAt: string;
  formattedTime: string;
}

/**
 * Structured actors object for easy access
 */
export interface OrderActors {
  creator?: OrderActor;
  bankingCollector?: OrderActor;
  panCollector?: OrderActor;
  bankAdder?: OrderActor;
  payer?: OrderActor;
  completer?: OrderActor;
  canceller?: OrderActor;
  allActors: OrderActor[];
}

// Human-readable labels for action types
const ACTION_LABELS: Record<string, string> = {
  'order_created': 'Created By',
  'banking_collected': 'Banking Collected By',
  'pan_collected': 'PAN Collected By',
  'added_to_bank': 'Added to Bank By',
  'payment_created': 'Payment Recorded By',
  'payment_completed': 'Payment Completed By',
  'order_completed': 'Order Completed By',
  'order_cancelled': 'Order Cancelled By',
  'order_expired': 'Order Expired',
  'manual_entry_created': 'Manual Entry Created By',
};

/**
 * Resolves an array of user IDs to a map of id→username
 */
async function resolveUsernames(userIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (userIds.length === 0) return map;

  const { data: users } = await supabase
    .from('users')
    .select('id, username')
    .in('id', userIds);

  users?.forEach(user => {
    map[user.id] = user.username || 'Unknown User';
  });

  return map;
}

/**
 * Hook to fetch actor ownership data for a purchase order.
 * Falls back to purchase_orders.created_by + system_action_logs
 * when purchase_action_timings has no records (for older orders).
 */
export function useOrderActors(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order_actors', orderId],
    queryFn: async (): Promise<OrderActors> => {
      if (!orderId) {
        return { allActors: [] };
      }

      // Fetch action timings for this order
      const { data: timings, error } = await supabase
        .from('purchase_action_timings')
        .select('action_type, actor_role, actor_user_id, recorded_at')
        .eq('order_id', orderId)
        .order('recorded_at', { ascending: true });

      if (error) {
        console.error('[useOrderActors] Error fetching timings:', error);
      }

      // If we have timing records, use them directly
      if (timings && timings.length > 0) {
        const userIds = [...new Set(timings.map(t => t.actor_user_id).filter(Boolean))] as string[];
        const userMap = await resolveUsernames(userIds);

        const allActors: OrderActor[] = timings.map(timing => ({
          actionType: timing.action_type,
          actionLabel: ACTION_LABELS[timing.action_type] || timing.action_type,
          actorRole: timing.actor_role,
          actorUserId: timing.actor_user_id,
          actorName: timing.actor_user_id
            ? (userMap[timing.actor_user_id] || 'Unknown User')
            : (timing.actor_role === 'system' ? 'System' : 'Unknown User'),
          recordedAt: timing.recorded_at,
          formattedTime: format(new Date(timing.recorded_at), 'dd MMM yyyy, HH:mm'),
        }));

        const findActor = (actionType: string) => allActors.find(a => a.actionType === actionType);

        return {
          creator: findActor('order_created'),
          bankingCollector: findActor('banking_collected'),
          panCollector: findActor('pan_collected'),
          bankAdder: findActor('added_to_bank'),
          payer: findActor('payment_completed') || findActor('payment_created'),
          completer: findActor('order_completed'),
          canceller: findActor('order_cancelled'),
          allActors,
        };
      }

      // ── FALLBACK: Build actors from purchase_orders + system_action_logs ──
      const allActors: OrderActor[] = [];

      // 1. Get created_by from purchase_orders
      const { data: orderData } = await supabase
        .from('purchase_orders')
        .select('created_by, created_at, status')
        .eq('id', orderId)
        .single();

      // 2. Get all system_action_logs for this order
      const { data: logs } = await supabase
        .from('system_action_logs')
        .select('action_type, user_id, user_name, recorded_at')
        .eq('entity_id', orderId)
        .eq('entity_type', 'purchase_order')
        .order('recorded_at', { ascending: true });

      // Collect all user IDs for resolution
      const userIds = new Set<string>();
      if (orderData?.created_by) userIds.add(orderData.created_by);
      logs?.forEach(l => { if (l.user_id) userIds.add(l.user_id); });
      const userMap = await resolveUsernames([...userIds]);

      // Add creator from purchase_orders.created_by
      if (orderData?.created_by) {
        allActors.push({
          actionType: 'order_created',
          actionLabel: 'Created By',
          actorRole: 'purchase_creator',
          actorUserId: orderData.created_by,
          actorName: userMap[orderData.created_by] || 'Unknown User',
          recordedAt: orderData.created_at,
          formattedTime: format(new Date(orderData.created_at), 'dd MMM yyyy, HH:mm'),
        });
      }

      // Map system_action_logs action_type → our display action_type
      const LOG_TO_ACTION: Record<string, { actionType: string; label: string; role: string }> = {
        'purchase.order_created': { actionType: 'order_created', label: 'Created By', role: 'purchase_creator' },
        'purchase.order_completed': { actionType: 'order_completed', label: 'Order Completed By', role: 'payer' },
        'purchase.order_cancelled': { actionType: 'order_cancelled', label: 'Order Cancelled By', role: 'system' },
        'purchase.order_edited': { actionType: 'order_edited', label: 'Order Edited By', role: 'purchase_creator' },
        'purchase.banking_collected': { actionType: 'banking_collected', label: 'Banking Collected By', role: 'purchase_creator' },
        'purchase.pan_collected': { actionType: 'pan_collected', label: 'PAN Collected By', role: 'purchase_creator' },
        'purchase.added_to_bank': { actionType: 'added_to_bank', label: 'Added to Bank By', role: 'payer' },
        'purchase.payment_created': { actionType: 'payment_created', label: 'Payment Recorded By', role: 'payer' },
        'purchase.payment_completed': { actionType: 'payment_completed', label: 'Payment Completed By', role: 'payer' },
        'purchase.manual_entry_created': { actionType: 'manual_entry_created', label: 'Manual Entry Created By', role: 'purchase_creator' },
      };

      // Add actors from system_action_logs (skip if we already have order_created from purchase_orders)
      const addedTypes = new Set(allActors.map(a => a.actionType));
      logs?.forEach(log => {
        const mapping = LOG_TO_ACTION[log.action_type];
        if (!mapping) return;
        if (addedTypes.has(mapping.actionType)) return; // Skip duplicates

        addedTypes.add(mapping.actionType);
        allActors.push({
          actionType: mapping.actionType,
          actionLabel: mapping.label,
          actorRole: mapping.role,
          actorUserId: log.user_id,
          actorName: log.user_id
            ? (userMap[log.user_id] || log.user_name || 'Unknown User')
            : (log.user_name || 'Unknown User'),
          recordedAt: log.recorded_at,
          formattedTime: format(new Date(log.recorded_at), 'dd MMM yyyy, HH:mm'),
        });
      });

      const findActor = (actionType: string) => allActors.find(a => a.actionType === actionType);

      return {
        creator: findActor('order_created'),
        bankingCollector: findActor('banking_collected'),
        panCollector: findActor('pan_collected'),
        bankAdder: findActor('added_to_bank'),
        payer: findActor('payment_completed') || findActor('payment_created'),
        completer: findActor('order_completed'),
        canceller: findActor('order_cancelled'),
        allActors,
      };
    },
    enabled: !!orderId,
    staleTime: 30000,
  });
}
