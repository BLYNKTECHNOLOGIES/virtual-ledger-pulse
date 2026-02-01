import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BuyOrder } from "@/lib/buy-order-types";
import { useOrderFocus } from "@/contexts/OrderFocusContext";
import { useOrderAlertsContext } from "@/contexts/OrderAlertsContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { showOrderAlertNotification, createGlobalNotification } from "@/lib/alert-notifications";
import { getBuyOrderGrossAmount } from "@/lib/buy-order-amounts";
import { usePurchaseFunctions } from "@/hooks/usePurchaseFunctions";

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

/**
 * Runs buy-order alert detection globally (even when user is on other pages)
 * so the header bell always shows the exact reason for the buzzer.
 * Also sets up real-time subscriptions for live updates.
 */
export function BuyOrderAlertWatcher() {
  const wasAlreadyInitializedRef = useRef(getWasInitialized());
  const notifiedRef = useRef<Set<string>>(new Set());
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
  const { isAlertRelevant, isCombined, isPurchaseCreator, isPayer } = usePurchaseFunctions();

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
    refetchInterval: 30000, // Reduce polling since we have real-time now
  });

  // Set up real-time subscription for purchase_orders
  useEffect(() => {
    const channel = supabase
      .channel('purchase_orders_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders',
        },
        (payload) => {
          // Invalidate and refetch on any change
          queryClient.invalidateQueries({ queryKey: ['buy_orders_alerts'] });
          queryClient.invalidateQueries({ queryKey: ['buy_orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
      // order can be undefined; markAttended still stops alarm and stores best-effort hash
      markAttended(orderId, order);
    });
  }, [lastAttendedOrders?.at, lastAttendedOrders?.orderIds, orders, markAttended]);

  // If notifications were cleared, allow re-emitting notifications for still-active alerts/buzzers
  useEffect(() => {
    notifiedRef.current = new Set();
  }, [notificationsResetSignal]);

  useEffect(() => {
    if (!orders) return;

    // Use persistent flag to determine if this is truly the first load
    const isFirstLoad = !wasAlreadyInitializedRef.current;
    
    // Update alert states based on latest data
    processOrderChanges(orders, isFirstLoad);
    
    // Mark as initialized after first processing
    if (isFirstLoad) {
      wasAlreadyInitializedRef.current = true;
      setWasInitialized();
    }
    
    cleanupAttendedOrders(orders.map((o) => o.id));

    // Emit toast + bell notifications for any active alert
    orders.forEach((order) => {
      const alertState = needsAttention(order.id);
      if (!alertState?.needsAttention || !alertState.alertType) return;

      // Role-based filtering: skip alerts that aren't relevant to this user
      if (!isAlertRelevant(alertState.alertType, order.order_status)) {
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

      showOrderAlertNotification(orderInfo, handleNavigate);
      addNotification(createGlobalNotification(orderInfo));
    });
  }, [orders, processOrderChanges, cleanupAttendedOrders, needsAttention, addNotification, handleNavigate, isAlertRelevant]);

  return null;
}
