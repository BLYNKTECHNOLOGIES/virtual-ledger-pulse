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

// Role labels
const ROLE_LABELS: Record<string, string> = {
  'purchase_creator': 'Purchase Creator',
  'payer': 'Payer',
  'system': 'System',
};

/**
 * Hook to fetch actor ownership data for a purchase order.
 * Returns structured actor information for direct display on transactions.
 * 
 * @param orderId - The purchase order UUID
 * @returns OrderActors object with structured actor data
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
        throw error;
      }

      if (!timings || timings.length === 0) {
        return { allActors: [] };
      }

      // Get unique user IDs (filter out nulls)
      const userIds = [...new Set(timings.map(t => t.actor_user_id).filter(Boolean))] as string[];

      // Fetch user details if we have user IDs
      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, username, first_name, last_name')
          .in('id', userIds);

        if (usersError) {
          console.error('[useOrderActors] Error fetching users:', usersError);
        }

        users?.forEach(user => {
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          userMap[user.id] = fullName || user.username || 'Unknown User';
        });
      }

      // Transform timings to OrderActor format
      const allActors: OrderActor[] = timings.map(timing => ({
        actionType: timing.action_type,
        actionLabel: ACTION_LABELS[timing.action_type] || timing.action_type,
        actorRole: timing.actor_role,
        actorUserId: timing.actor_user_id,
        actorName: timing.actor_user_id 
          ? (userMap[timing.actor_user_id] || 'Unknown User')
          : (timing.actor_role === 'system' ? 'System' : ROLE_LABELS[timing.actor_role] || 'Unknown'),
        recordedAt: timing.recorded_at,
        formattedTime: format(new Date(timing.recorded_at), 'dd MMM yyyy, HH:mm:ss'),
      }));

      // Build structured actors object
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
    staleTime: 30000, // 30 seconds
  });
}
