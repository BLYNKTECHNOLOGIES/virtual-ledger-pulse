import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/lib/system-action-logger';

/**
 * Action types for purchase workflow timing capture
 * Each represents a distinct business event in the order lifecycle
 */
export type PurchaseActionType =
  | 'order_created'
  | 'order_cancelled'
  | 'order_expired'
  | 'order_completed'
  | 'banking_collected'
  | 'pan_collected'
  | 'added_to_bank'
  | 'payment_created'
  | 'payment_completed'
  | 'manual_entry_created';

/**
 * Actor roles for tracking who performed the action
 */
export type ActorRole = 'purchase_creator' | 'payer' | 'system';

/**
 * Records a timing entry for a purchase workflow action.
 * 
 * Key behaviors:
 * - Immutable: Uses INSERT with ON CONFLICT DO NOTHING to prevent overwrites
 * - Idempotent: Safe to call multiple times; only first call records the timestamp
 * - Non-blocking: Errors are logged but don't throw to avoid disrupting workflows
 * - Auto-resolves user ID: If actorUserId is not provided, attempts to get current user from session
 * 
 * @param orderId - The purchase order UUID
 * @param actionType - The type of action being recorded
 * @param actorRole - The role performing the action
 * @param actorUserId - Optional user ID of the actor (auto-resolved if not provided)
 */
export async function recordActionTiming(
  orderId: string,
  actionType: PurchaseActionType,
  actorRole: ActorRole = 'system',
  actorUserId?: string
): Promise<void> {
  try {
    // Validate orderId
    if (!orderId || typeof orderId !== 'string') {
      console.warn('[ActionTiming] Invalid orderId provided:', orderId);
      return;
    }

    // Auto-resolve user ID if not provided (except for system actions)
    let resolvedUserId = actorUserId;
    if (!resolvedUserId && actorRole !== 'system') {
      resolvedUserId = getCurrentUserId() || undefined;
    }

    // Use upsert with ignoreDuplicates to ensure immutability
    // The unique constraint on (order_id, action_type) prevents duplicates
    const { error } = await supabase
      .from('purchase_action_timings')
      .upsert(
        {
          order_id: orderId,
          action_type: actionType,
          actor_role: actorRole,
          actor_user_id: resolvedUserId || null,
          recorded_at: new Date().toISOString(),
        },
        {
          onConflict: 'order_id,action_type',
          ignoreDuplicates: true, // Critical: prevents overwriting existing timestamps
        }
      );

    if (error) {
      // Log but don't throw - timing capture should never block workflows
      console.warn('[ActionTiming] Failed to record timing:', {
        orderId,
        actionType,
        error: error.message,
      });
    }
  } catch (err) {
    // Fail silently to avoid disrupting the main workflow
    console.warn('[ActionTiming] Unexpected error recording timing:', err);
  }
}

/**
 * Records multiple action timings in a single batch operation.
 * Useful for recording sequential events that happen together.
 * 
 * @param orderId - The purchase order UUID
 * @param actions - Array of action types and their actor roles
 */
export async function recordMultipleTimings(
  orderId: string,
  actions: Array<{ actionType: PurchaseActionType; actorRole: ActorRole; actorUserId?: string }>
): Promise<void> {
  if (!orderId || !actions.length) return;

  // Auto-resolve user ID for all non-system actions that don't have one
  const currentUserId = getCurrentUserId();

  try {
    const records = actions.map(({ actionType, actorRole, actorUserId }) => ({
      order_id: orderId,
      action_type: actionType,
      actor_role: actorRole,
      actor_user_id: actorUserId || (actorRole !== 'system' ? currentUserId : null) || null,
      recorded_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('purchase_action_timings')
      .upsert(records, {
        onConflict: 'order_id,action_type',
        ignoreDuplicates: true,
      });

    if (error) {
      console.warn('[ActionTiming] Failed to record batch timings:', error.message);
    }
  } catch (err) {
    console.warn('[ActionTiming] Unexpected error in batch recording:', err);
  }
}

/**
 * Fetches all recorded timings for a specific order.
 * Useful for debugging and future analytics.
 * 
 * @param orderId - The purchase order UUID
 * @returns Array of timing records or empty array on error
 */
export async function getOrderTimings(orderId: string): Promise<Array<{
  action_type: string;
  actor_role: string;
  recorded_at: string;
}>> {
  try {
    const { data, error } = await supabase
      .from('purchase_action_timings')
      .select('action_type, actor_role, recorded_at')
      .eq('order_id', orderId)
      .order('recorded_at', { ascending: true });

    if (error) {
      console.warn('[ActionTiming] Failed to fetch timings:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('[ActionTiming] Unexpected error fetching timings:', err);
    return [];
  }
}
