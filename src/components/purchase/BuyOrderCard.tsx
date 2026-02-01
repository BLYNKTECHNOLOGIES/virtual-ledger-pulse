import { useEffect, useState } from 'react';
import { BuyOrder, BuyOrderStatus, BUY_ORDER_STATUS_CONFIG, STATUS_ORDER, calculatePayout } from '@/lib/buy-order-types';
import { hasBankingDetails, hasTdsTypeSelected, getMissingFieldsForStatus, getEffectivePanType } from '@/lib/buy-order-helpers';
import { getBuyOrderGrossAmount } from '@/lib/buy-order-amounts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronRight, 
  Edit, 
  Phone, 
  Banknote, 
  CreditCard,
  User,
  Clock,
  MoreHorizontal,
  XCircle,
  CheckCircle2,
  Eye,
  Bell,
  Wallet,
  MapPin,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OrderTimer, OrderExpiryTimer } from './OrderTimer';
import { ReviewDialog } from './ReviewDialog';
import { ReviewIndicator } from './ReviewIndicator';
import type { AlertType } from '@/hooks/use-order-alerts';
import type { BuzzerIntensity } from '@/hooks/usePurchaseFunctions';
import { useIsOrderFocused } from '@/contexts/OrderFocusContext';

interface PurchaseFunctionContext {
  isCombined: boolean;
  isPurchaseCreator: boolean;
  isPayer: boolean;
  canCollectBanking: boolean;
  canCollectPan: boolean;
  canAddToBank: boolean;
  canRecordPayment: boolean;
  showWaitingForBanking: boolean;
  showWaitingForPan: boolean;
  canSubmitReview: boolean;
  canSeeReviews: boolean;
  canCompleteOrder: boolean;
  getBuzzerIntensity: (alertType: string, isUrgent?: boolean) => BuzzerIntensity;
  isAlertRelevant: (alertType: string, orderStatus?: string) => boolean;
}

interface BuyOrderCardProps {
  order: BuyOrder;
  onEdit: () => void;
  onStatusChange: (newStatus: BuyOrderStatus) => void;
  onCollectFields: (targetStatus: BuyOrderStatus, collectType: 'banking' | 'pan', missingFields: string[]) => void;
  onSetTimer: (targetStatus: BuyOrderStatus, showPayNow?: boolean) => void;
  onViewDetails: () => void;
  onRecordPayment: () => void;
  alertState?: { needsAttention: boolean; alertType: AlertType | null } | null;
  onMarkAttended?: () => void;
  onTriggerTimerAlert?: (type: 'payment_timer' | 'order_timer', isUrgent: boolean, buzzerConfig?: BuzzerIntensity) => void;
  purchaseFunctions?: PurchaseFunctionContext;
}

export function BuyOrderCard({ 
  order, 
  onEdit, 
  onStatusChange, 
  onCollectFields, 
  onSetTimer, 
  onViewDetails, 
  onRecordPayment,
  alertState,
  onMarkAttended,
  onTriggerTimerAlert,
  purchaseFunctions
}: BuyOrderCardProps) {
  const currentStatus = order.order_status || 'new';
  const isFocused = useIsOrderFocused(order.id);
  const [showFocusHighlight, setShowFocusHighlight] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Default to combined mode if no context provided (backward compatibility)
  const pf = purchaseFunctions || {
    isCombined: true,
    isPurchaseCreator: true,
    isPayer: true,
    canCollectBanking: true,
    canCollectPan: true,
    canAddToBank: true,
    canRecordPayment: true,
    showWaitingForBanking: false,
    showWaitingForPan: false,
    canSubmitReview: false,
    canSeeReviews: false,
    canCompleteOrder: true,
    getBuzzerIntensity: () => ({ type: 'single' as const }),
    isAlertRelevant: () => true,
  };

  // Handle focus highlight animation
  useEffect(() => {
    if (isFocused) {
      setShowFocusHighlight(true);
      // Remove highlight after animation completes
      const timer = setTimeout(() => {
        setShowFocusHighlight(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isFocused]);

  const statusConfig = BUY_ORDER_STATUS_CONFIG[currentStatus] || {
    label: currentStatus,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    nextStatus: 'new' as BuyOrderStatus,
    icon: '❓',
  };

  const bankingCollected = hasBankingDetails(order);
  const tdsSelected = hasTdsTypeSelected(order);

  // Calculate the ACTUAL next status, skipping steps where data is already provided
  // Also respects role-based restrictions
  const computeNextStatus = (): BuyOrderStatus | null => {
    const staticNext = statusConfig.nextStatus;
    if (!staticNext) return null;

    // Role-based restrictions for Payer-only: cannot advance from 'new' to banking_collected
    // They should see "Waiting for bank details" instead
    if (pf.showWaitingForBanking && !bankingCollected) {
      if (currentStatus === 'new') {
        return null; // Payer cannot collect banking
      }
    }

    // Role-based restrictions for Payer-only: cannot collect PAN
    // They should see "Collecting PAN" instead
    if (pf.showWaitingForPan && !tdsSelected) {
      // If we're on banking_collected status and PAN not yet collected, payer cannot proceed
      if (currentStatus === 'banking_collected') {
        return null; // Payer cannot collect PAN
      }
      // If we're on 'new' with banking already collected but no TDS, payer still can't collect PAN
      if (currentStatus === 'new' && bankingCollected) {
        return null; // Payer cannot collect PAN
      }
    }

    // From 'new' status: skip banking_collected if banking already provided
    if (currentStatus === 'new' && bankingCollected) {
      // If TDS is also already selected, skip to added_to_bank
      if (tdsSelected) {
        // Check if payer can add to bank
        if (!pf.canAddToBank) return null;
        return 'added_to_bank';
      }
      // Payer cannot collect PAN
      if (!pf.canCollectPan) return null;
      return 'pan_collected';
    }

    // From 'banking_collected' status: skip pan_collected if TDS already selected
    if (currentStatus === 'banking_collected' && tdsSelected) {
      if (!pf.canAddToBank) return null;
      return 'added_to_bank';
    }

    // From 'banking_collected' status: Payer cannot proceed to pan_collected
    if (currentStatus === 'banking_collected' && !pf.canCollectPan) {
      return null;
    }

    // Role-based: Purchase Creator cannot advance to 'added_to_bank'
    if (staticNext === 'added_to_bank' && !pf.canAddToBank) {
      return null;
    }

    // Role-based: Purchase Creator cannot record payment (advance to 'paid')
    if (staticNext === 'paid' && !pf.canRecordPayment) {
      return null;
    }

    return staticNext;
  };

  const nextStatus = computeNextStatus();

  // Payment tracking
  const totalPaid = order.total_paid || 0;
  const effectivePanType = getEffectivePanType(order);
  const grossAmount = getBuyOrderGrossAmount(order);
  const payoutInfo = effectivePanType 
    ? calculatePayout(grossAmount, effectivePanType)
    : { payout: grossAmount, deductionPercent: 0 };
  const remainingAmount = Math.max(0, payoutInfo.payout - totalPaid);
  const hasPartialPayment = totalPaid > 0 && remainingAmount > 0;

  const getTdsLabel = () => {
    if (!effectivePanType) return null;
    switch (effectivePanType) {
      case 'pan_provided': return '1% TDS';
      case 'pan_not_provided': return '20% TDS';
      case 'non_tds': return 'Non-TDS';
      default: return null;
    }
  };
  const tdsLabel = getTdsLabel();

  const needsBlink = alertState?.needsAttention;
  const blinkType = alertState?.alertType;
  const hasActiveTimer = currentStatus === 'added_to_bank' && order.timer_end_at;

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate the actual next status, skipping steps if data is already provided
  const getActualNextStatus = (targetStatus: BuyOrderStatus): BuyOrderStatus => {
    // If targeting banking_collected and already have banking, skip to pan_collected
    if (targetStatus === 'banking_collected' && bankingCollected) {
      // Check if pan is also collected, skip that too
      if (tdsSelected) {
        return 'added_to_bank';
      }
      return 'pan_collected';
    }
    // If targeting pan_collected and already have TDS selected, skip to added_to_bank
    if (targetStatus === 'pan_collected' && tdsSelected) {
      return 'added_to_bank';
    }
    return targetStatus;
  };

  const handleStatusChange = (newStatus: BuyOrderStatus) => {
    if (newStatus === 'paid') {
      // Only payers can record payment
      if (!pf.canRecordPayment) return;
      onRecordPayment();
      return;
    }

    // Calculate the effective status after auto-skipping completed steps
    const effectiveStatus = getActualNextStatus(newStatus);
    
    const missing = getMissingFieldsForStatus(order, effectiveStatus);
    
    if (missing.type === 'timer') {
      // Pass showPayNow=true to allow instant payment option
      onSetTimer(effectiveStatus, true);
    } else if (missing.type === 'pan') {
      onCollectFields(effectiveStatus, missing.type, missing.fields);
    } else if (missing.type && missing.fields.length > 0) {
      onCollectFields(effectiveStatus, missing.type, missing.fields);
    } else {
      // No dialog needed, directly change to the effective status
      onStatusChange(effectiveStatus);
    }
  };

  const isStepCompleted = (status: BuyOrderStatus, index: number): boolean => {
    const currentIndex = STATUS_ORDER.indexOf(currentStatus);
    if (index < currentIndex) return true;
    if (currentStatus === 'completed') return true;
    if (status === 'banking_collected' && bankingCollected) return true;
    if (status === 'pan_collected' && tdsSelected) return true;
    return false;
  };

  const getCardStyles = () => {
    // Focus highlight takes priority
    if (showFocusHighlight) {
      return 'border-2 border-primary bg-primary/5 ring-2 ring-primary/20 shadow-lg transition-all duration-500';
    }

    if (!needsBlink) {
      if (hasActiveTimer) {
        return 'border-red-300 bg-red-50/30';
      }
      return '';
    }

    if (blinkType === 'new_order' || blinkType === 'info_update') {
      return 'border-green-400 bg-green-50 animate-pulse';
    }

    if (blinkType === 'payment_timer' || blinkType === 'order_timer') {
      return 'border-red-400 bg-red-50 animate-pulse';
    }

    return '';
  };

  return (
    <Card 
      id={`order-card-${order.id}`}
      className={cn('hover:shadow-md transition-all', getCardStyles())}
    >
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left Section - Order Info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Order Expiry Timer - Only trigger if relevant to this role */}
              {order.order_expires_at && !['completed', 'cancelled'].includes(currentStatus) && (
                <OrderExpiryTimer
                  orderExpiresAt={order.order_expires_at}
                  orderId={order.id}
                  onTriggerAlert={onTriggerTimerAlert && pf.isAlertRelevant('order_timer', currentStatus) 
                    ? (isUrgent: boolean) => {
                        const buzzerConfig = pf.getBuzzerIntensity('order_timer', isUrgent);
                        onTriggerTimerAlert('order_timer', isUrgent, buzzerConfig);
                      } 
                    : undefined}
                />
              )}
              <span className="font-mono font-semibold text-lg">{order.order_number}</span>
              <Badge className={cn('text-xs', statusConfig.bgColor, statusConfig.color)}>
                {statusConfig.icon} {statusConfig.label}
              </Badge>
              
              {/* Safe Fund Badge */}
              {order.is_safe_fund && (
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                  🛡️ Safe Fund
                </Badge>
              )}
              
              {/* Off Market Badge */}
              {order.is_off_market && (
                <Badge variant="outline" className="text-xs text-purple-600 border-purple-200 bg-purple-50">
                  📴 Off Market
                </Badge>
              )}
              
              {/* Collected badges */}
              {bankingCollected && currentStatus === 'new' && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Banking
                </Badge>
              )}
              {tdsSelected && STATUS_ORDER.indexOf(currentStatus) <= STATUS_ORDER.indexOf('banking_collected') && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {tdsLabel || 'TDS'}
                </Badge>
              )}
              
              {/* Payment Timer - Only trigger if relevant to this role (Payer only for Add to Bank timer) */}
              {currentStatus === 'added_to_bank' && order.timer_end_at && (
                <OrderTimer 
                  timerEndAt={order.timer_end_at} 
                  orderId={order.id}
                  onTriggerAlert={onTriggerTimerAlert && pf.isAlertRelevant('payment_timer', currentStatus)
                    ? (isUrgent: boolean) => {
                        const buzzerConfig = pf.getBuzzerIntensity('payment_timer', isUrgent);
                        onTriggerTimerAlert('payment_timer', isUrgent, buzzerConfig);
                      }
                    : undefined}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground text-lg">
                  {formatAmount(grossAmount)}
                </span>
                {hasPartialPayment && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-600 font-medium">
                    <span>Remaining: {formatAmount(remainingAmount)}</span>
                    {tdsLabel && (
                      <Badge variant="outline" className="text-[10px] py-0 h-4 text-orange-600 border-orange-200 bg-orange-50">
                        {tdsLabel}
                      </Badge>
                    )}
                  </div>
                )}
                {remainingAmount === 0 && totalPaid > 0 && tdsLabel && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 w-fit text-emerald-600 border-emerald-200 bg-emerald-50">
                    {tdsLabel} Applied
                  </Badge>
                )}
                {totalPaid > 0 && (
                  <span className="text-xs text-emerald-600">
                    Paid: {formatAmount(totalPaid)}
                  </span>
                )}
              </div>
              
              {order.supplier_name && (
                <div className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  <span>{order.supplier_name}</span>
                </div>
              )}
              
              {order.contact_number && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{order.contact_number}</span>
                </div>
              )}
              
              {order.payment_method_type === 'UPI' && order.upi_id && (
                <div className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{order.upi_id}</span>
                </div>
              )}
              
              {order.payment_method_type !== 'UPI' && order.bank_account_name && (
                <div className="flex items-center gap-1">
                  <Banknote className="h-3.5 w-3.5" />
                  <span>{order.bank_account_name}</span>
                </div>
              )}
              
              {order.warehouse_name && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{order.warehouse_name}</span>
                </div>
              )}
              
              {!order.is_off_market && order.fee_percentage > 0 && (
                <div className="flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>{order.fee_percentage}% fee</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Created {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
            </div>
          </div>

          {/* Right Section - Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Review Indicator for Purchase Creator */}
            {pf.canSeeReviews && (
              <ReviewIndicator orderId={order.id} />
            )}

            {/* Review Button for Payer */}
            {pf.canSubmitReview && !['completed', 'cancelled'].includes(currentStatus) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReviewDialog(true)}
                className="gap-1"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Review</span>
              </Button>
            )}

            {/* Waiting for Banking indicator for Payer-only */}
            {pf.showWaitingForBanking && !bankingCollected && currentStatus === 'new' && (
              <Badge variant="outline" className="text-xs border-muted-foreground/50">
                <AlertCircle className="h-3 w-3 mr-1" />
                Waiting for bank details
              </Badge>
            )}

            {/* Collecting PAN indicator for Payer-only */}
            {pf.showWaitingForPan && !tdsSelected && bankingCollected && 
             (currentStatus === 'new' || currentStatus === 'banking_collected') && (
              <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-600 bg-indigo-50">
                <AlertCircle className="h-3 w-3 mr-1" />
                Collecting PAN
              </Badge>
            )}

            {/* Waiting for Payment indicator for Creator-only */}
            {!pf.canRecordPayment && currentStatus === 'added_to_bank' && (
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 bg-amber-50">
                <AlertCircle className="h-3 w-3 mr-1" />
                Waiting for Payment
              </Badge>
            )}

            {/* Attended Button */}
            {needsBlink && onMarkAttended && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkAttended}
                className={cn(
                  "gap-1",
                  blinkType === 'new_order' || blinkType === 'info_update'
                    ? "border-green-500 text-green-600 hover:bg-green-50"
                    : "border-red-500 text-red-600 hover:bg-red-50"
                )}
              >
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Attended</span>
              </Button>
            )}

            {/* View Details Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onViewDetails}
              className="gap-1"
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Details</span>
            </Button>

            {nextStatus && (
              <Button
                size="sm"
                onClick={() => handleStatusChange(nextStatus)}
                className="gap-1"
              >
                {BUY_ORDER_STATUS_CONFIG[nextStatus].icon}
                <span className="hidden sm:inline">
                  {nextStatus === 'added_to_bank' ? 'Add to Bank' : BUY_ORDER_STATUS_CONFIG[nextStatus].label}
                </span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Order
                </DropdownMenuItem>
              {currentStatus !== 'completed' && currentStatus !== 'cancelled' && (
                  <>
                    <DropdownMenuSeparator />
                    {STATUS_ORDER.map((status) => {
                      // Hide 'paid' option for creators who can't record payment
                      if (status === 'paid' && !pf.canRecordPayment) return null;
                      // Hide 'pan_collected' option for payers who can't collect PAN
                      if (status === 'pan_collected' && !pf.canCollectPan) return null;
                      // Hide 'added_to_bank' option for creators who can't add to bank
                      if (status === 'added_to_bank' && !pf.canAddToBank) return null;
                      // Hide 'completed' option for Payers - they can NOT complete orders
                      if (status === 'completed' && !pf.canCompleteOrder) return null;
                      
                      return (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          disabled={currentStatus === status}
                        >
                          <span className="mr-2">{BUY_ORDER_STATUS_CONFIG[status].icon}</span>
                          {status === 'added_to_bank' ? 'Add to Bank' : `Move to ${BUY_ORDER_STATUS_CONFIG[status].label}`}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onStatusChange('cancelled')}
                      className="text-destructive"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Order
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Status Progress Bar */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            {STATUS_ORDER.map((status, index) => {
              const config = BUY_ORDER_STATUS_CONFIG[status];
              const isCurrent = currentStatus === status;
              const isCancelled = currentStatus === 'cancelled';
              const isCompleted = isStepCompleted(status, index);

              return (
                <div key={status} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs',
                        isCancelled ? 'bg-muted text-muted-foreground' :
                        isCompleted ? 'bg-green-500 text-white' :
                        isCurrent ? cn(config.bgColor, config.color) :
                        'bg-muted text-muted-foreground'
                      )}
                    >
                      {isCompleted && !isCurrent ? '✓' : config.icon}
                    </div>
                    <span className={cn(
                      'text-[10px] mt-1 text-center hidden sm:block',
                      isCurrent ? 'font-medium text-foreground' : 
                      isCompleted ? 'text-green-600 font-medium' :
                      'text-muted-foreground'
                    )}>
                      {config.label}
                    </span>
                  </div>
                  {index < STATUS_ORDER.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-1',
                        !isCancelled && isCompleted ? 'bg-green-500' : 'bg-muted'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      {/* Review Dialog for Payer */}
      <ReviewDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        orderId={order.id}
        orderNumber={order.order_number}
      />
    </Card>
  );
}
