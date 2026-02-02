import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AlertType } from '@/hooks/use-order-alerts';

export type BuzzerIntensity = 
  | { type: 'none' }
  | { type: 'single' }
  | { type: 'single_subtle' }
  | { type: 'continuous'; repeatIntervalMs?: number }
  | { type: 'duration'; durationMs: number; repeatIntervalMs?: number };

export type PurchaseAlertType = AlertType | 'banking_collected' | 'payment_done' | 'order_expired' | 'order_cancelled' | 'review_message';

interface PurchaseFunctionState {
  isPurchaseCreator: boolean;
  isPayer: boolean;
  isCombined: boolean;
  isLoading: boolean;
}

export function usePurchaseFunctions() {
  const { user } = useAuth();
  const [state, setState] = useState<PurchaseFunctionState>({
    isPurchaseCreator: false,
    isPayer: false,
    isCombined: false,
    isLoading: true,
  });

  useEffect(() => {
    const fetchFunctions = async () => {
      if (!user?.id) {
        setState({
          isPurchaseCreator: false,
          isPayer: false,
          isCombined: false,
          isLoading: false,
        });
        return;
      }

      // Some legacy/demo accounts may have non-UUID ids (e.g. "demo-admin-id").
      // The RPC expects UUID and will throw (22P02), which can break unrelated UIs.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id);
      if (!isUuid) {
        // Treat as combined mode (no restrictions) and stop.
        setState({
          isPurchaseCreator: true,
          isPayer: true,
          isCombined: true,
          isLoading: false,
        });
        return;
      }

      try {
        // Fetch functions from the user's role via the new role_functions system
        const { data, error } = await supabase
          .rpc('get_user_role_functions', { p_user_id: user.id });

        if (error) {
          console.error('Error fetching role functions:', error);
          // Fallback to legacy direct user fields if RPC fails
          await fetchLegacyFunctions();
          return;
        }

        // Parse the function keys from the result
        const functionKeys = (data || []).map((f: any) => f.function_key);
        const isPurchaseCreator = functionKeys.includes('purchase_creator');
        const isPayer = functionKeys.includes('payer');
        const isCombined = isPurchaseCreator && isPayer;

        setState({
          isPurchaseCreator,
          isPayer,
          isCombined,
          isLoading: false,
        });
      } catch (err) {
        console.error('Error in fetchFunctions:', err);
        // Fallback to legacy
        await fetchLegacyFunctions();
      }
    };

    // Legacy fallback - read from users table directly (for backward compatibility)
    const fetchLegacyFunctions = async () => {
      if (!user?.id) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('is_purchase_creator, is_payer')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching legacy purchase functions:', error);
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        const isPurchaseCreator = data?.is_purchase_creator ?? false;
        const isPayer = data?.is_payer ?? false;
        const isCombined = isPurchaseCreator && isPayer;

        setState({
          isPurchaseCreator,
          isPayer,
          isCombined,
          isLoading: false,
        });
      } catch (err) {
        console.error('Error in fetchLegacyFunctions:', err);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchFunctions();
  }, [user?.id]);

  // Check if an alert is relevant for the current user's role
  const isAlertRelevant = useCallback((
    alertType: PurchaseAlertType,
    orderStatus?: string
  ): boolean => {
    const { isPurchaseCreator, isPayer, isCombined } = state;

    // Combined mode: all alerts are relevant (current behavior)
    if (isCombined) return true;

    // Terminal states: no alerts are relevant
    if (orderStatus === 'completed' || orderStatus === 'cancelled') {
      return false;
    }

    // Purchase Creator relevance
    // Creator should NOT receive: new_order, banking_collected, payment_timer (Add to Bank timer), payment_done
    if (isPurchaseCreator && !isPayer) {
      switch (alertType) {
        case 'order_timer':
          return true; // Order expiry timer (5 min single, 2 min continuous)
        case 'review_message':
          return true; // When payer sends a review
        // Creator must NOT receive these:
        case 'new_order':
        case 'info_update':
        case 'banking_collected':
        case 'payment_timer': // Add to Bank timer - Payer only
        case 'order_expired':
        case 'order_cancelled':
          return false;
        case 'payment_done':
          return false;
        default:
          return false;
      }
    }

    // Payer relevance
    // Payer receives: new_order, banking_collected, payment_timer (Add to Bank timer), payment_done
    if (isPayer && !isPurchaseCreator) {
      switch (alertType) {
        case 'new_order':
          return true; // Single buzzer when order comes in
        case 'banking_collected':
          return true; // Single buzzer when banking is collected
        case 'payment_timer':
          return true; // Add to Bank timer: 5 min single, 2 min for 10 seconds
        case 'payment_done':
          return true; // Single notification sound when payment is recorded
        case 'order_expired':
        case 'order_cancelled':
          return true; // Single buzzer
        // Payer must NOT receive these:
        case 'order_timer': // Order expiry timer - Creator only
        case 'review_message':
        case 'info_update':
          return false;
        default:
          return false;
      }
    }

    // If no functions are enabled, show all alerts (fallback behavior)
    if (!isPurchaseCreator && !isPayer) {
      return true;
    }

    return false;
  }, [state]);

  // Get buzzer intensity for a given alert type based on role
  const getBuzzerIntensity = useCallback((
    alertType: PurchaseAlertType,
    isUrgent: boolean = false // For timer alerts: true = 2 min, false = 5 min
  ): BuzzerIntensity => {
    const { isPurchaseCreator, isPayer, isCombined } = state;

    // Combined mode: 
    // - payment_timer (Add to Bank): 5 min = SINGLE, 2 min = continuous
    // - order_timer (Order expiry): 5 min = SINGLE, 2 min = continuous
    if (isCombined) {
      if (alertType === 'payment_timer' || alertType === 'order_timer') {
        // 5 min = single beep only, 2 min = repeating alarm every 10s
        return isUrgent ? { type: 'continuous', repeatIntervalMs: 10000 } : { type: 'single' };
      }
      return { type: 'single' };
    }

    // Purchase Creator - only receives order_timer, payment_done, review_message
    // Does NOT receive payment_timer (Add to Bank timer)
    if (isPurchaseCreator && !isPayer) {
      switch (alertType) {
        case 'order_timer':
          // Order expiry: 5 min = single, 2 min = repeating alarm every 10s
          return isUrgent ? { type: 'continuous', repeatIntervalMs: 10000 } : { type: 'single' };
        case 'review_message':
          return { type: 'single' };
        default:
          return { type: 'none' };
      }
    }

    // Payer - receives new_order, banking_collected, payment_timer (Add to Bank timer)
    // Does NOT receive order_timer
    if (isPayer && !isPurchaseCreator) {
      switch (alertType) {
        case 'new_order':
        case 'banking_collected':
        case 'order_expired':
        case 'order_cancelled':
          return { type: 'single' };
        case 'payment_timer':
          // Add to Bank timer: 5 min = single, 2 min = repeating alarm every 10s
          return isUrgent ? { type: 'continuous', repeatIntervalMs: 10000 } : { type: 'single' };
        case 'payment_done':
          return { type: 'single' };
        default:
          return { type: 'none' };
      }
    }

    // Default fallback
    return { type: 'single' };
  }, [state]);

  // Visibility helpers for UI elements
  const canCreateOrders = useMemo(() => {
    return state.isCombined || state.isPurchaseCreator;
  }, [state.isCombined, state.isPurchaseCreator]);

  const canCollectBanking = useMemo(() => {
    // Purchase Creator and combined mode can collect banking
    // Payer-only cannot collect banking
    return state.isCombined || state.isPurchaseCreator;
  }, [state.isCombined, state.isPurchaseCreator]);

  const canCollectPan = useMemo(() => {
    // Only Purchase Creator and combined mode can collect PAN
    // Payer-only cannot collect PAN
    return state.isCombined || state.isPurchaseCreator;
  }, [state.isCombined, state.isPurchaseCreator]);

  const canAddToBank = useMemo(() => {
    return state.isCombined || state.isPayer;
  }, [state.isCombined, state.isPayer]);

  const canRecordPayment = useMemo(() => {
    return state.isCombined || state.isPayer;
  }, [state.isCombined, state.isPayer]);

  const showWaitingForBanking = useMemo(() => {
    // Payer-only shows "Waiting for bank details" when banking not collected
    return state.isPayer && !state.isPurchaseCreator;
  }, [state.isPayer, state.isPurchaseCreator]);

  const showWaitingForPan = useMemo(() => {
    // Payer-only shows "Collecting PAN" when PAN not collected
    return state.isPayer && !state.isPurchaseCreator;
  }, [state.isPayer, state.isPurchaseCreator]);

  const canSubmitReview = useMemo(() => {
    // Only Payer can submit reviews
    return state.isPayer && !state.isCombined;
  }, [state.isPayer, state.isCombined]);

  const canSeeReviews = useMemo(() => {
    // Only Purchase Creator can see reviews
    return state.isPurchaseCreator && !state.isCombined;
  }, [state.isPurchaseCreator, state.isCombined]);

  const canCompleteOrder = useMemo(() => {
    // Payer CANNOT complete orders - only Combined or Purchase Creator can
    // Payer is limited to Add to Bank actions and payments only
    return state.isCombined || state.isPurchaseCreator;
  }, [state.isCombined, state.isPurchaseCreator]);

  return {
    ...state,
    isAlertRelevant,
    getBuzzerIntensity,
    canCreateOrders,
    canCollectBanking,
    canCollectPan,
    canAddToBank,
    canRecordPayment,
    showWaitingForBanking,
    showWaitingForPan,
    canSubmitReview,
    canSeeReviews,
    canCompleteOrder,
  };
}
