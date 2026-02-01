import { toast } from '@/hooks/use-toast';
import { AlertType } from '@/hooks/use-order-alerts';

interface OrderAlertInfo {
  orderId: string;
  orderNumber: string;
  supplierName?: string | null;
  amount?: number;
  alertType: AlertType;
}

// Format amount in INR
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Get descriptive title and message for each alert type
export function getAlertDetails(alertType: AlertType, orderInfo: OrderAlertInfo): {
  title: string;
  description: string;
  icon: string;
  type: 'info' | 'warning' | 'error' | 'success';
} {
  const orderLabel = orderInfo.orderNumber || 'Order';
  const supplierLabel = orderInfo.supplierName ? ` from ${orderInfo.supplierName}` : '';
  const amountLabel = orderInfo.amount ? ` (${formatAmount(orderInfo.amount)})` : '';

  switch (alertType) {
    case 'new_order':
      return {
        title: '🆕 New Buy Order',
        description: `Order #${orderLabel}${supplierLabel}${amountLabel} has been created and needs attention.`,
        icon: '🆕',
        type: 'info',
      };
    case 'info_update':
      return {
        title: '📝 Order Updated',
        description: `Order #${orderLabel}${supplierLabel} has been updated with new information.`,
        icon: '📝',
        type: 'info',
      };
    case 'payment_timer':
      return {
        title: '⏰ Payment Timer Alert',
        description: `Order #${orderLabel}${amountLabel} - Payment timer is running low! Complete payment soon.`,
        icon: '⏰',
        type: 'warning',
      };
    case 'order_timer':
      return {
        title: '⚠️ Order Expiring Soon',
        description: `Order #${orderLabel}${supplierLabel}${amountLabel} is about to expire! Take action now.`,
        icon: '⚠️',
        type: 'error',
      };
    case 'banking_collected':
      return {
        title: '🏦 Banking Details Collected',
        description: `Order #${orderLabel}${supplierLabel} - Banking details have been collected. Ready for bank addition.`,
        icon: '🏦',
        type: 'info',
      };
    case 'payment_done':
      return {
        title: '💰 Payment Completed',
        description: `Order #${orderLabel}${supplierLabel}${amountLabel} - Payment has been recorded.`,
        icon: '💰',
        type: 'success',
      };
    case 'order_expired':
      return {
        title: '⌛ Order Expired',
        description: `Order #${orderLabel}${supplierLabel} has expired.`,
        icon: '⌛',
        type: 'error',
      };
    case 'order_cancelled':
      return {
        title: '❌ Order Cancelled',
        description: `Order #${orderLabel}${supplierLabel} has been cancelled.`,
        icon: '❌',
        type: 'error',
      };
    case 'review_message':
      return {
        title: '💬 New Review Message',
        description: `Order #${orderLabel} - You have a new review message from the Payer.`,
        icon: '💬',
        type: 'info',
      };
    default:
      return {
        title: '🔔 Order Alert',
        description: `Order #${orderLabel} requires your attention.`,
        icon: '🔔',
        type: 'info',
      };
  }
}

// Show notification toast for an order alert
export function showOrderAlertNotification(
  orderInfo: OrderAlertInfo,
  onNavigate: (orderId: string) => void
): void {
  const { title, description } = getAlertDetails(orderInfo.alertType, orderInfo);
  
  // Determine variant based on alert type
  const isUrgent = orderInfo.alertType === 'payment_timer' || orderInfo.alertType === 'order_timer';
  
  // Create full description with navigation hint
  const fullDescription = `${description} Click to view.`;
  
  toast({
    title,
    description: fullDescription,
    variant: isUrgent ? 'destructive' : 'default',
    duration: isUrgent ? 10000 : 5000,
    onClick: () => onNavigate(orderInfo.orderId),
  });
}

// Add to global notification bell - this function should be called with the addNotification from context
export function createGlobalNotification(
  orderInfo: OrderAlertInfo
): {
  title: string;
  description: string;
  type: 'info' | 'warning' | 'error' | 'success';
  orderId: string;
  orderRoute: string;
} {
  const { title, description, type } = getAlertDetails(orderInfo.alertType, orderInfo);
  
  return {
    title,
    description,
    type,
    orderId: orderInfo.orderId,
    orderRoute: '/purchase',
  };
}
