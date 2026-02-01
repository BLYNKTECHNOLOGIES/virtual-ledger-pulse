import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BuyOrderCard } from "./BuyOrderCard";
import { BuyOrderStatusFilter } from "./BuyOrderStatusFilter";
import { CollectFieldsDialog } from "./CollectFieldsDialog";
import { SetTimerDialog } from "./SetTimerDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { PurchaseOrderDetailsDialog } from "./PurchaseOrderDetailsDialog";
import { EditPurchaseOrderDialog } from "./EditPurchaseOrderDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BuyOrder, BuyOrderStatus } from "@/lib/buy-order-types";
import { stopContinuousAlarm } from "@/hooks/use-order-alerts";
import { getBuyOrderNetPayableAmount } from "@/lib/buy-order-amounts";
import { useNotifications } from "@/contexts/NotificationContext";
import { useOrderAlertsContext } from "@/contexts/OrderAlertsContext";
import { usePurchaseFunctions } from "@/hooks/usePurchaseFunctions";

interface BuyOrdersTabProps {
  searchTerm?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export function BuyOrdersTab({ searchTerm, dateFrom, dateTo }: BuyOrdersTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<BuyOrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<BuyOrder | null>(null);
  const [collectType, setCollectType] = useState<'banking' | 'pan' | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<BuyOrderStatus>('new');
  const [showTimerDialog, setShowTimerDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Prevent SetTimerDialog close from clearing state when user clicks "Pay Now"
  const payNowTransitionRef = useRef(false);

  // Global notification context
  const { lastOrderNavigation } = useNotifications();

  // Alert hooks (shared globally via provider)
  const { markAttended, needsAttention, triggerTimerAlert } = useOrderAlertsContext();

  // Purchase function context for role-based visibility
  const purchaseFunctions = usePurchaseFunctions();

  // Fetch purchase orders with buy order workflow status
  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['buy_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products (name, code)
          ),
          purchase_payment_method:purchase_payment_method_id (
            id,
            type,
            bank_account_name,
            min_limit,
            max_limit,
            payment_limit,
            current_usage
          ),
          created_by_user:users!created_by(username, first_name, last_name)
        `)
        .not('order_status', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as BuyOrder[];
    },
    staleTime: 10000,
  });

  // Set up real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('buy_orders_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders',
        },
        () => {
          // Refetch on any change to get updated data
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // When user clicks a bell notification, mark the order attended to stop repeat buzzers
  useEffect(() => {
    if (!lastOrderNavigation?.orderId || !orders) return;
    const order = orders.find(o => o.id === lastOrderNavigation.orderId);
    if (order) {
      markAttended(order.id, order);
    }
  }, [lastOrderNavigation?.at, lastOrderNavigation?.orderId, orders, markAttended]);

  // NOTE: Alert detection + notification emitting now runs globally via BuyOrderAlertWatcher.

  // Calculate status counts
  const statusCounts = useMemo(() => {
    if (!orders) return {};
    
    const counts: Partial<Record<BuyOrderStatus | 'all', number>> = {
      all: orders.length,
    };
    
    orders.forEach((order) => {
      const status = order.order_status as BuyOrderStatus;
      counts[status] = (counts[status] || 0) + 1;
    });
    
    return counts;
  }, [orders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    
    return orders.filter((order) => {
      // Status filter
      if (selectedStatus !== 'all' && order.order_status !== selectedStatus) {
        return false;
      }
      
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          order.order_number?.toLowerCase().includes(term) ||
          order.supplier_name?.toLowerCase().includes(term) ||
          order.contact_number?.includes(term);
        if (!matchesSearch) return false;
      }
      
      // Date filter
      if (dateFrom || dateTo) {
        const orderDate = order.created_at ? new Date(order.created_at) : null;
        if (dateFrom && orderDate && orderDate < dateFrom) return false;
        if (dateTo && orderDate && orderDate > dateTo) return false;
      }
      
      return true;
    });
  }, [orders, selectedStatus, searchTerm, dateFrom, dateTo]);

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: BuyOrderStatus }) => {
      const updates: Record<string, any> = {
        order_status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Handle status change to completed - also update the main status
      if (newStatus === 'completed') {
        updates.status = 'COMPLETED';
      }
      
      // Handle cancellation - update main status, NO fee deduction
      if (newStatus === 'cancelled') {
        updates.status = 'CANCELLED';
        // Explicitly ensure no fee is applied on cancellation
        updates.fee_amount = 0;
        updates.net_amount = 0;
      }

      const { error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', orderId);
      
      if (error) throw error;

      // ONLY handle balance updates and fee deduction when COMPLETING (not cancelling)
      if (newStatus === 'completed') {
        const order = orders?.find(o => o.id === orderId);
        if (order) {
          const amountToDeduct = getBuyOrderNetPayableAmount(order);

          // Handle wallet credit for USDT
          const orderItems = order.purchase_order_items || [];
          for (const item of orderItems) {
            const product = item.products;
            if (product?.code === 'USDT') {
              const { data: usdtWallets } = await supabase
                .from('wallets')
                .select('*')
                .eq('wallet_type', 'USDT')
                .eq('is_active', true)
                .limit(1);

              if (usdtWallets && usdtWallets.length > 0) {
                const wallet = usdtWallets[0];
                
                // Calculate net quantity after platform fee (only if not off-market)
                let netQuantity = item.quantity;
                if (!order.is_off_market && order.fee_percentage > 0) {
                  const feeQuantity = item.quantity * (order.fee_percentage / 100);
                  netQuantity = item.quantity - feeQuantity;
                  
                  // Record platform fee deduction transaction
                  await supabase
                    .from('wallet_transactions')
                    .insert({
                      wallet_id: wallet.id,
                      transaction_type: 'FEE_DEDUCTION',
                      amount: feeQuantity,
                      reference_type: 'PLATFORM_FEE',
                      reference_id: orderId,
                      description: `Platform fee (${order.fee_percentage}%) for buy order ${order.order_number}`,
                      balance_before: 0,
                      balance_after: 0
                    });
                }
                
                // Credit net quantity to wallet
                await supabase
                  .from('wallet_transactions')
                  .insert({
                    wallet_id: wallet.id,
                    transaction_type: 'CREDIT',
                    amount: netQuantity,
                    reference_type: 'PURCHASE_ORDER',
                    reference_id: orderId,
                    description: `USDT purchased via buy order ${order.order_number}${!order.is_off_market && order.fee_percentage > 0 ? ' (after platform fee)' : ''}`,
                    balance_before: 0,
                    balance_after: 0
                  });
              }
            }
          }

          // Create bank expense transaction if bank account is linked
          if (order.bank_account_id) {
            // Prevent duplicate deductions: if any Purchase EXPENSE already exists for this order reference,
            // don't insert another one.
            const { data: existingTx, error: existingTxError } = await supabase
              .from('bank_transactions')
              .select('id')
              .eq('transaction_type', 'EXPENSE')
              .eq('category', 'Purchase')
              .eq('reference_number', order.order_number)
              .limit(1);

            if (existingTxError) throw existingTxError;

            if (!existingTx || existingTx.length === 0) {
              await supabase
                .from('bank_transactions')
                .insert({
                  bank_account_id: order.bank_account_id,
                  transaction_type: 'EXPENSE',
                  amount: amountToDeduct,
                  transaction_date: new Date().toISOString().split('T')[0],
                  category: 'Purchase',
                  description: `Buy Order - ${order.supplier_name} - Order #${order.order_number}`,
                  reference_number: order.order_number,
                  related_account_name: order.supplier_name,
                });
            }
          }
        }
      }
      // NOTE: Cancelled orders do NOT trigger any balance updates or fee deductions
    },
    onSuccess: (_, { orderId, newStatus }) => {
      // Stop any active alarms immediately for completed/cancelled orders
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        stopContinuousAlarm(orderId);
      }
      
      if (newStatus === 'completed') {
        toast({
          title: "Order Completed",
          description: "Buy order has been completed. Stock and balances updated.",
        });
        queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
        queryClient.invalidateQueries({ queryKey: ['wallets'] });
        queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['wallet_fee_deductions'] });
      } else if (newStatus === 'cancelled') {
        toast({
          title: "Order Cancelled",
          description: "Buy order has been cancelled. No fees were deducted.",
        });
      } else {
        toast({
          title: "Status Updated",
          description: `Order moved to ${newStatus.replace('_', ' ')}.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['buy_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleStatusChange = (orderId: string, newStatus: BuyOrderStatus) => {
    updateStatusMutation.mutate({ orderId, newStatus });
  };

  const handleCollectFields = (
    order: BuyOrder,
    targetStat: BuyOrderStatus,
    collectTyp: 'banking' | 'pan',
    fields: string[]
  ) => {
    setSelectedOrder(order);
    setCollectType(collectTyp);
    setMissingFields(fields);
    setTargetStatus(targetStat);
  };

  const handleSetTimer = (order: BuyOrder, targetStat: BuyOrderStatus, showPayNow?: boolean) => {
    setSelectedOrder(order);
    setTargetStatus(targetStat);
    setShowTimerDialog(true);
    // If showPayNow is true, we'll handle the Pay Now click in the dialog
  };

  const handlePayNowFromTimer = () => {
    payNowTransitionRef.current = true;
    setShowTimerDialog(false);
    setShowPaymentDialog(true);
    // Reset shortly after transition completes
    window.setTimeout(() => {
      payNowTransitionRef.current = false;
    }, 300);
  };

  const handleTimerDialogOpenChange = (open: boolean) => {
    if (!open) {
      // If we're closing because of Pay Now, don't clear selectedOrder.
      if (payNowTransitionRef.current) {
        setShowTimerDialog(false);
        return;
      }
      closeAllDialogs();
      return;
    }
    setShowTimerDialog(true);
  };

  const handleRecordPayment = (order: BuyOrder) => {
    setSelectedOrder(order);
    setShowPaymentDialog(true);
  };

  const handleViewDetails = (order: BuyOrder) => {
    setSelectedOrder(order);
    setShowDetailsDialog(true);
  };

  const handleEdit = (order: BuyOrder) => {
    setSelectedOrder(order);
    setShowEditDialog(true);
  };

  const handleMarkAttended = (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    markAttended(orderId, order);
  };

  const handleDialogSuccess = () => {
    setSelectedOrder(null);
    setCollectType(null);
    setMissingFields([]);
    setShowTimerDialog(false);
    setShowPaymentDialog(false);
    setShowDetailsDialog(false);
    setShowEditDialog(false);
    refetch();
  };

  const closeAllDialogs = () => {
    setSelectedOrder(null);
    setCollectType(null);
    setMissingFields([]);
    setShowTimerDialog(false);
    setShowPaymentDialog(false);
    setShowDetailsDialog(false);
    setShowEditDialog(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BuyOrderStatusFilter
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        statusCounts={statusCounts}
      />

      {filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-lg font-semibold mb-2">No Buy Orders</h3>
          <p className="text-muted-foreground">
            {selectedStatus === 'all' 
              ? 'No buy orders found matching your filters.'
              : `No orders with status "${selectedStatus}".`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map((order) => (
            <BuyOrderCard
              key={order.id}
              order={order}
              onEdit={() => handleEdit(order)}
              onStatusChange={(newStatus) => handleStatusChange(order.id, newStatus)}
              onCollectFields={(targetStat, collectTyp, fields) => 
                handleCollectFields(order, targetStat, collectTyp, fields)
              }
              onSetTimer={(targetStat, showPayNow) => handleSetTimer(order, targetStat, showPayNow)}
              onViewDetails={() => handleViewDetails(order)}
              onRecordPayment={() => handleRecordPayment(order)}
              alertState={needsAttention(order.id)}
              onMarkAttended={() => handleMarkAttended(order.id)}
              onTriggerTimerAlert={(type) => triggerTimerAlert(order.id, type)}
              purchaseFunctions={purchaseFunctions}
            />
          ))}
        </div>
      )}

      {/* Collect Fields Dialog (Banking or PAN) */}
      <CollectFieldsDialog
        open={collectType !== null}
        onOpenChange={(open) => !open && closeAllDialogs()}
        order={selectedOrder}
        collectType={collectType}
        missingFields={missingFields}
        targetStatus={targetStatus}
        onSuccess={handleDialogSuccess}
      />

      {/* Set Timer Dialog */}
      <SetTimerDialog
        open={showTimerDialog}
        onOpenChange={handleTimerDialogOpenChange}
        order={selectedOrder}
        onSuccess={handleDialogSuccess}
        onPayNow={handlePayNowFromTimer}
      />

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={showPaymentDialog}
        onOpenChange={(open) => !open && closeAllDialogs()}
        order={selectedOrder}
        onSuccess={handleDialogSuccess}
      />

      {/* Order Details Dialog */}
      <PurchaseOrderDetailsDialog
        open={showDetailsDialog}
        onOpenChange={(open) => !open && closeAllDialogs()}
        order={selectedOrder}
      />

      {/* Edit Order Dialog */}
      <EditPurchaseOrderDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          if (!open) closeAllDialogs();
          else setShowEditDialog(open);
        }}
        order={selectedOrder}
      />
    </div>
  );
}
