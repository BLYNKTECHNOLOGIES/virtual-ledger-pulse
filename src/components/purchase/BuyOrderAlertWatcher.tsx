import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BuyOrder } from "@/lib/buy-order-types";
import { useOrderFocus } from "@/contexts/OrderFocusContext";
import { useOrderAlertsContext } from "@/contexts/OrderAlertsContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { showOrderAlertNotification, createGlobalNotification } from "@/lib/alert-notifications";
import { getBuyOrderGrossAmount } from "@/lib/buy-order-amounts";
import { usePurchaseFunctions, type PurchaseAlertType } from "@/hooks/usePurchaseFunctions";
import { playAlertSound, startContinuousAlarm, stopContinuousAlarm, generateOrderDataHash, type AlertType } from "@/hooks/use-order-alerts";

// Persist initial load state across component remounts (tab switches)
const INITIAL_LOAD_KEY = 'buy_order_watcher_initialized';

function getWasInitialized(): boolean {
  try {
    return sessionStorage.getItem(INITIAL_LOAD_KEY) === 'true';
  } catch {
    return false;
  }
}

function setWasInitialized() {
  try {
    sessionStorage.setItem(INITIAL_LOAD_KEY, 'true');
  } catch {
    // Ignore
  }
}

// Track previous order states for real-time change detection
const REALTIME_PREV_KEY = 'buy_order_realtime_prev_v1';

function getRealtimePreviousState(): Record<string, string> {
  try {
    const stored = localStorage.getItem(REALTIME_PREV_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveRealtimePreviousState(state: Record<string, string>) {
  try {
    localStorage.setItem(REALTIME_PREV_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

/**
 * Runs buy-order alert detection globally (even when user is on other pages)
 * so the header bell always shows the exact reason for the buzzer.
 * Also sets up real-time subscriptions for live updates.
 * 
 * CRITICAL: Notifications are triggered directly from real-time subscription
 * callbacks, NOT from React Query refetch effects. This ensures immediate
 * delivery even when the browser tab is inactive or minimized.
 */
export function BuyOrderAlertWatcher() {
  const wasAlreadyInitializedRef = useRef(getWasInitialized());
  const notifiedRef = useRef<Set<string>>(new Set());
  const realtimePrevRef = useRef<Record<string, string>>(getRealtimePreviousState());
  const queryClient = useQueryClient();
  const { addNotification, lastOrderNavigation, lastAttendedOrders, notificationsResetSignal } = useNotifications();
  const { focusOrder } = useOrderFocus();

  const {
    markAttended,
    needsAttention,
    processOrderChanges,
    cleanupAttendedOrders,
  } = useOrderAlertsContext();

  // Get purchase function context for role-based alert filtering
  const purchaseFunctionsRef = useRef(usePurchaseFunctions());
  const pf = usePurchaseFunctions();
  
  // Keep ref updated with latest values for use in real-time callback
  useEffect(() => {
    purchaseFunctionsRef.current = pf;
  }, [pf]);

  // Store callbacks in refs for stable access in real-time handler
  const addNotificationRef = useRef(addNotification);
  const focusOrderRef = useRef(focusOrder);
  const markAttendedRef = useRef(markAttended);
  
  useEffect(() => {
    addNotificationRef.current = addNotification;
    focusOrderRef.current = focusOrder;
    markAttendedRef.current = markAttended;
  }, [addNotification, focusOrder, markAttended]);

  const { data: orders } = useQuery({
    queryKey: ["buy_orders_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          id,
          order_number,
          supplier_name,
          contact_number,
          pan_number,
          bank_account_name,
          bank_account_number,
          ifsc_code,
          upi_id,
          timer_end_at,
          total_paid,
          notes,
          order_status,
          order_expires_at,
          updated_at,
          purchase_order_items (
            id,
            quantity,
            products (name, code)
          )
        `
        )
        .not("order_status", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as BuyOrder[];
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  /**
   * CRITICAL: Real-time subscription that triggers notifications IMMEDIATELY
   * when database changes occur, regardless of tab focus state.
   * 
   * This is the primary notification triggering mechanism for real-time delivery.
   */
  useEffect(() => {
    const handleRealtimeChange = async (payload: any) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      // Immediately invalidate queries so UI updates when tab becomes active
      queryClient.invalidateQueries({ queryKey: ['buy_orders_alerts'] });
      queryClient.invalidateQueries({ queryKey: ['buy_orders'] });
      
      // Skip if no order_status (not a buy order)
      if (!newRecord?.order_status) return;
      
      const orderId = newRecord.id;
      const orderStatus = newRecord.order_status;
      const pf = purchaseFunctionsRef.current;
      
      // Get previous state for this order
      const prevHash = realtimePrevRef.current[orderId];
      const currentHash = generateOrderDataHash(newRecord);
      
      // Skip if order data hasn't actually changed
      if (prevHash === currentHash) return;
      
      // Update stored previous state
      realtimePrevRef.current[orderId] = currentHash;
      saveRealtimePreviousState(realtimePrevRef.current);
      
      // Determine alert type based on change
      let alertType: PurchaseAlertType | null = null;
      
      // Check for terminal states - no alerts for these
      const isTerminal = orderStatus === 'completed' || orderStatus === 'cancelled';
      if (isTerminal) {
        stopContinuousAlarm(orderId);
        return;
      }
      
      // Parse previous data if available (prevHash is a JSON string from generateOrderDataHash)
      let prev: any = null;
      if (prevHash) {
        try {
          prev = JSON.parse(prevHash);
        } catch {
          prev = null;
        }
      }
      
      // Detect specific transitions
      if (eventType === 'INSERT') {
        // New order created - Payer should receive notification
        alertType = 'new_order';
      } else if (eventType === 'UPDATE') {
        // Parse old record data for comparison (oldRecord may have order_status)
        const prevStatus = prev?.order_status || oldRecord?.order_status;
        
        // Add to Bank is silent - no notification
        if (prevStatus !== 'added_to_bank' && orderStatus === 'added_to_bank') {
          return;
        }
        
        // Payment done - triggers notification for Payer
        if (prevStatus !== 'paid' && orderStatus === 'paid') {
          alertType = 'payment_done';
        }
        // Banking collected - check if banking details were just added
        // This can happen at ANY status before completion/cancellation
        // Must check regardless of current status (not just 'new' or 'banking_collected')
        else {
          const prevHadBank = Boolean(prev?.bank_account_name || prev?.bank_account_number || prev?.ifsc_code || prev?.upi_id);
          const nowHasBank = Boolean(newRecord.bank_account_name || newRecord.bank_account_number || newRecord.ifsc_code || newRecord.upi_id);
          if (!prevHadBank && nowHasBank) {
            alertType = 'banking_collected';
          }
        }
        
        // Fallback to info_update if something changed but no specific type matched
        // info_update is not relevant for Payer, so this won't trigger for them
        if (!alertType && prevHash) {
          alertType = 'info_update';
        }
      }
      
      if (!alertType) return;
      
      // Role-based filtering: check if this alert is relevant to current user
      if (!pf.isAlertRelevant(alertType, orderStatus)) {
        return;
      }
      
      // Generate unique notification key to prevent duplicates
      const notificationKey = `${orderId}-${alertType}-${Date.now()}`;
      if (notifiedRef.current.has(notificationKey)) return;
      notifiedRef.current.add(notificationKey);
      
      // Build order info for notification
      const orderInfo = {
        orderId: orderId,
        orderNumber: newRecord.order_number,
        supplierName: newRecord.supplier_name,
        amount: getBuyOrderGrossAmount(newRecord as BuyOrder),
        alertType: alertType as any,
      };
      
      // Get buzzer intensity based on role
      const buzzerIntensity = pf.getBuzzerIntensity(alertType, false);
      
      // Play sound immediately - this works even when tab is inactive
      // because Web Audio API continues to run in background
      if (buzzerIntensity.type === 'single') {
        playAlertSound(alertType as any);
      } else if (buzzerIntensity.type === 'single_subtle') {
        playAlertSound(alertType as any, true);
      } else if (buzzerIntensity.type === 'continuous') {
        playAlertSound(alertType as any);
        if (alertType === 'payment_timer' || alertType === 'order_timer') {
          startContinuousAlarm(orderId, alertType as any, undefined, buzzerIntensity.repeatIntervalMs ?? 1500);
        }
      } else if (buzzerIntensity.type === 'duration') {
        playAlertSound(alertType as any);
        if (alertType === 'payment_timer' || alertType === 'order_timer') {
          startContinuousAlarm(
            orderId,
            alertType as any,
            buzzerIntensity.durationMs,
            buzzerIntensity.repeatIntervalMs ?? 1500
          );
        }
      }
      
      // Add notification to bell and show toast
      if (buzzerIntensity.type !== 'none') {
        const handleNavigate = (navOrderId: string) => {
          focusOrderRef.current(navOrderId);
        };
        showOrderAlertNotification(orderInfo, handleNavigate);
        addNotificationRef.current(createGlobalNotification(orderInfo));
      }
    };
    
    // Subscribe to purchase_orders changes
    const ordersChannel = supabase
      .channel('purchase_orders_realtime_alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders',
        },
        handleRealtimeChange
      )
      .subscribe();

    // Subscribe to purchase_order_payments for payment_done alerts to Creator
    const handlePaymentInsert = async (payload: any) => {
      const { eventType, new: newRecord } = payload;
      
      // Only handle INSERT events for payments
      if (eventType !== 'INSERT' || !newRecord) return;
      
      const orderId = newRecord.purchase_order_id;
      if (!orderId) return;
      
      // Fetch the order to get details for notification
      const { data: orderData } = await supabase
        .from('purchase_orders')
        .select('id, order_number, supplier_name, order_status')
        .eq('id', orderId)
        .single();
      
      if (!orderData || orderData.order_status === 'completed' || orderData.order_status === 'cancelled') {
        return;
      }
      
      const pf = purchaseFunctionsRef.current;
      
      // Only trigger for Purchase Creator role (not Payer who made the payment)
      if (!pf.isAlertRelevant('payment_done', orderData.order_status)) {
        return;
      }
      
      // Generate unique notification key to prevent duplicates
      const paymentId = newRecord.id;
      const notificationKey = `payment-${paymentId}`;
      if (notifiedRef.current.has(notificationKey)) return;
      notifiedRef.current.add(notificationKey);
      
      // Invalidate queries so UI updates
      queryClient.invalidateQueries({ queryKey: ['buy_orders_alerts'] });
      queryClient.invalidateQueries({ queryKey: ['buy_orders'] });
      
      const orderInfo = {
        orderId: orderId,
        orderNumber: orderData.order_number,
        supplierName: orderData.supplier_name,
        amount: newRecord.amount_paid,
        alertType: 'payment_done' as any,
      };
      
      // Get buzzer intensity - should be single_subtle for Creator
      const buzzerIntensity = pf.getBuzzerIntensity('payment_done', false);
      
      // Play subtle sound
      if (buzzerIntensity.type === 'single') {
        playAlertSound('payment_done');
      } else if (buzzerIntensity.type === 'single_subtle') {
        playAlertSound('payment_done', true);
      }
      
      // Add notification to bell and show toast
      if (buzzerIntensity.type !== 'none') {
        const handleNavigate = (navOrderId: string) => {
          focusOrderRef.current(navOrderId);
        };
        showOrderAlertNotification(orderInfo, handleNavigate);
        addNotificationRef.current(createGlobalNotification(orderInfo));
      }
    };
    
    const paymentsChannel = supabase
      .channel('purchase_payments_realtime_alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'purchase_order_payments',
        },
        handlePaymentInsert
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [queryClient]);

  const handleNavigate = useCallback(
    (orderId: string) => {
      focusOrder(orderId);
      const order = orders?.find((o) => o.id === orderId);
      if (order) markAttended(orderId, order);
    },
    [focusOrder, orders, markAttended]
  );

  // When user clicks a bell notification, immediately mark order as attended and stop buzzer
  useEffect(() => {
    if (!lastOrderNavigation?.orderId || !orders) return;
    const order = orders.find((o) => o.id === lastOrderNavigation.orderId);
    if (order) {
      markAttended(order.id, order);
    }
  }, [lastOrderNavigation?.at, lastOrderNavigation?.orderId, orders, markAttended]);

  // When user marks all notifications read or clears them, treat those orders as attended too
  useEffect(() => {
    if (!lastAttendedOrders?.orderIds?.length) return;
    const orderIds = lastAttendedOrders.orderIds;
    orderIds.forEach((orderId) => {
      const order = orders?.find((o) => o.id === orderId);
      markAttended(orderId, order);
    });
  }, [lastAttendedOrders?.at, lastAttendedOrders?.orderIds, orders, markAttended]);

  // If notifications were cleared, allow re-emitting notifications for still-active alerts/buzzers
  useEffect(() => {
    notifiedRef.current = new Set();
  }, [notificationsResetSignal]);

  /**
   * Secondary effect: Process order data for timer alerts and UI state.
   * This runs on query data changes (for timers that need continuous monitoring)
   * but is NOT the primary notification trigger for real-time events.
   */
  useEffect(() => {
    if (!orders) return;

    const isFirstLoad = !wasAlreadyInitializedRef.current;
    
    // Update alert states based on latest data (for timers)
    processOrderChanges(orders, isFirstLoad);
    
    if (isFirstLoad) {
      wasAlreadyInitializedRef.current = true;
      setWasInitialized();
    }
    
    cleanupAttendedOrders(orders.map((o) => o.id));

    // Process timer-based alerts (5-min, 2-min warnings)
    // These still need to be checked periodically since they're time-based
    orders.forEach((order) => {
      const alertState = needsAttention(order.id);
      if (!alertState?.needsAttention || !alertState.alertType) return;

      // Role-based filtering
      if (!pf.isAlertRelevant(alertState.alertType, order.order_status)) {
        stopContinuousAlarm(order.id);
        return;
      }

      const notificationKey = `${order.id}-${alertState.alertType}-${alertState.lastAlertTime}`;
      if (notifiedRef.current.has(notificationKey)) return;
      notifiedRef.current.add(notificationKey);

      const orderInfo = {
        orderId: order.id,
        orderNumber: order.order_number,
        supplierName: order.supplier_name,
        amount: getBuyOrderGrossAmount(order),
        alertType: alertState.alertType,
      };

      const buzzerIntensity = pf.getBuzzerIntensity(
        alertState.alertType,
        Boolean((alertState as any).timerUrgent)
      );
      
      if (buzzerIntensity.type === 'single') {
        playAlertSound(alertState.alertType);
      } else if (buzzerIntensity.type === 'single_subtle') {
        playAlertSound(alertState.alertType, true);
      } else if (buzzerIntensity.type === 'continuous') {
        playAlertSound(alertState.alertType);
        if (alertState.alertType === 'payment_timer' || alertState.alertType === 'order_timer') {
          startContinuousAlarm(order.id, alertState.alertType, undefined, buzzerIntensity.repeatIntervalMs ?? 1500);
        }
      } else if (buzzerIntensity.type === 'duration') {
        playAlertSound(alertState.alertType);
        if (alertState.alertType === 'payment_timer' || alertState.alertType === 'order_timer') {
          startContinuousAlarm(
            order.id,
            alertState.alertType,
            buzzerIntensity.durationMs,
            buzzerIntensity.repeatIntervalMs ?? 1500
          );
        }
      }

      if (buzzerIntensity.type !== 'none') {
        showOrderAlertNotification(orderInfo, handleNavigate);
        addNotification(createGlobalNotification(orderInfo));
      }
    });
  }, [orders, processOrderChanges, cleanupAttendedOrders, needsAttention, addNotification, handleNavigate, pf]);

  return null;
}
