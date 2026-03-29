import type { AlertType } from '@/hooks/use-order-alerts';

export type BuzzerIntensity = 
  | { type: 'none' }
  | { type: 'single' }
  | { type: 'single_subtle' }
  | { type: 'continuous'; repeatIntervalMs?: number }
  | { type: 'duration'; durationMs: number; repeatIntervalMs?: number };

export type PurchaseAlertType = AlertType | 'banking_collected' | 'payment_done' | 'order_expired' | 'order_cancelled' | 'review_message';

/**
 * Simplified hook — purchase_creator / payer split has been removed.
 * All users with purchase_manage permission operate in "combined mode".
 * This hook returns static values with zero network calls.
 */
export function usePurchaseFunctions() {
  return {
    isPurchaseCreator: true,
    isPayer: true,
    isCombined: true,
    isLoading: false,
    isAlertRelevant: (_alertType: PurchaseAlertType | string, _orderStatus?: string): boolean => true,
    getBuzzerIntensity: (alertType: PurchaseAlertType | string, isUrgent: boolean = false): BuzzerIntensity => {
      if (alertType === 'payment_timer' || alertType === 'order_timer') {
        return isUrgent ? { type: 'continuous', repeatIntervalMs: 10000 } : { type: 'single' };
      }
      return { type: 'single' };
    },
    canCreateOrders: true,
    canCollectBanking: true,
    canCollectPan: true,
    canAddToBank: true,
    canRecordPayment: true,
    showWaitingForBanking: false,
    showWaitingForPan: false,
    canSubmitReview: false,
    canSeeReviews: false,
    canCompleteOrder: true,
  };
}
