import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BuyOrder } from "@/lib/buy-order-types";
import { useOrderFocus } from "@/contexts/OrderFocusContext";
import { useOrderAlertsContext } from "@/contexts/OrderAlertsContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { showOrderAlertNotification, createGlobalNotification } from "@/lib/alert-notifications";
import { getBuyOrderGrossAmount } from "@/lib/buy-order-amounts";

/**
 * Runs buy-order alert detection globally (even when user is on other pages)
 * so the header bell always shows the exact reason for the buzzer.
 */
export function BuyOrderAlertWatcher() {
  const isInitialLoadRef = useRef(true);
  const notifiedRef = useRef<Set<string>>(new Set());
  const { addNotification, lastOrderNavigation } = useNotifications();
  const { focusOrder } = useOrderFocus();

  const {
    markAttended,
    needsAttention,
    processOrderChanges,
    cleanupAttendedOrders,
  } = useOrderAlertsContext();

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
    staleTime: 15000,
    refetchInterval: 15000,
  });

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

  useEffect(() => {
    if (!orders) return;

    // Update alert states based on latest data
    processOrderChanges(orders, isInitialLoadRef.current);
    isInitialLoadRef.current = false;
    cleanupAttendedOrders(orders.map((o) => o.id));

    // Emit toast + bell notifications for any active alert
    orders.forEach((order) => {
      const alertState = needsAttention(order.id);
      if (!alertState?.needsAttention || !alertState.alertType) return;

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
  }, [orders, processOrderChanges, cleanupAttendedOrders, needsAttention, addNotification, handleNavigate]);

  return null;
}
