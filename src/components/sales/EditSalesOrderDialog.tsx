import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WalletSelector } from "@/components/stock/WalletSelector";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface EditSalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function EditSalesOrderDialog({ open, onOpenChange, order }: EditSalesOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [originalWalletId, setOriginalWalletId] = useState<string | null>(null);
  const [originalPaymentMethodId, setOriginalPaymentMethodId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    order_number: '',
    client_name: '',
    client_phone: '',
    client_state: '',
    platform: '',
    quantity: 1,
    price_per_unit: 0,
    total_amount: 0,
    payment_status: 'COMPLETED',
    order_date: '',
    description: '',
    risk_level: 'HIGH',
    sales_payment_method_id: '',
    product_id: '',
    warehouse_id: '',
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(
            account_name,
            bank_name,
            status
          )
        `);
      if (error) throw error;
      return (data || []).filter(method => method.bank_accounts?.status === 'ACTIVE');
    },
    enabled: open,
  });

  useEffect(() => {
    if (order) {
      const walletId = order.wallet_id || order.wallet?.id || '';
      setOriginalWalletId(walletId);
      setOriginalPaymentMethodId(order.sales_payment_method_id || null);
      setFormData({
        order_number: order.order_number || '',
        client_name: order.client_name || '',
        client_phone: order.client_phone || '',
        client_state: order.client_state || '',
        platform: order.platform || '',
        quantity: order.quantity || 1,
        price_per_unit: order.price_per_unit || 0,
        total_amount: order.total_amount || 0,
        payment_status: order.payment_status || 'COMPLETED',
        order_date: order.order_date || '',
        description: order.description || '',
        risk_level: order.risk_level || 'HIGH',
        sales_payment_method_id: order.sales_payment_method_id || '',
        product_id: order.product_id || '',
        warehouse_id: walletId,
      });
    }
  }, [order]);

  const updateSalesOrderMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const walletChanged = originalWalletId && data.warehouse_id && originalWalletId !== data.warehouse_id;
      const quantityChanged = order.quantity !== data.quantity;
      const amountChanged = order.total_amount !== data.total_amount;
      const paymentMethodChanged = originalPaymentMethodId !== data.sales_payment_method_id;
      const isCompleted = order.payment_status === 'COMPLETED';

      // For completed orders, use comprehensive reconciliation RPC
      // when financial fields (amount, quantity, wallet) change
      if (isCompleted && (amountChanged || quantityChanged || walletChanged)) {
        // Get wallet fee percentage
        let feePercentage = 0;
        let isOffMarket = order.is_off_market || false;
        if (data.warehouse_id) {
          const { data: walletData } = await supabase
            .from('wallets')
            .select('fee_percentage, is_fee_enabled')
            .eq('id', data.warehouse_id)
            .single();
          if (walletData?.is_fee_enabled) {
            feePercentage = walletData.fee_percentage || 0;
          }
        }

        const { data: reconcileResult, error: reconcileError } = await supabase.rpc('reconcile_sales_order_edit', {
          p_order_id: order.id,
          p_order_number: data.order_number,
          p_old_total_amount: order.total_amount,
          p_new_total_amount: data.total_amount,
          p_old_quantity: order.quantity,
          p_new_quantity: data.quantity,
          p_old_wallet_id: originalWalletId,
          p_new_wallet_id: data.warehouse_id || null,
          p_payment_method_id: data.sales_payment_method_id || null,
          p_client_name: data.client_name,
          p_order_date: data.order_date,
          p_is_off_market: isOffMarket,
          p_fee_percentage: feePercentage,
        });

        if (reconcileError) {
          console.error('Reconciliation error:', reconcileError);
          throw new Error(`Failed to reconcile: ${reconcileError.message}`);
        }

        const result = reconcileResult as any;
        if (result && !result.success) {
          throw new Error(result.error || 'Reconciliation failed');
        }

        console.log('✅ Sales order reconciliation completed:', result);
      } else if (isCompleted) {
        // Handle payment method change only (no financial field change)
        if (paymentMethodChanged) {
          console.log('🔄 Payment method changed, processing...');
          const { data: pmResult, error: pmError } = await supabase.rpc('handle_sales_order_payment_method_change', {
            p_order_id: order.id,
            p_old_payment_method_id: originalPaymentMethodId,
            p_new_payment_method_id: data.sales_payment_method_id || null,
            p_total_amount: data.total_amount
          });

          if (pmError) throw new Error(`Failed to transfer payment method: ${pmError.message}`);
          if (pmResult && !(pmResult as any).success) throw new Error((pmResult as any).error);
          console.log('✅ Payment method change processed', pmResult);
        }

        // Repair: if order is completed + has payment method + no INCOME tx exists
        const selectedPaymentMethod = paymentMethods?.find((m: any) => m.id === data.sales_payment_method_id);
        const selectedIsGateway = Boolean((selectedPaymentMethod as any)?.payment_gateway);
        if (!paymentMethodChanged && data.sales_payment_method_id && !selectedIsGateway) {
          const { count } = await supabase
            .from('bank_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('reference_number', data.order_number)
            .eq('transaction_type', 'INCOME');

          if ((count || 0) === 0) {
            console.log('🩹 Missing INCOME bank transaction detected; repairing...');
            await supabase.rpc('handle_sales_order_payment_method_change', {
              p_order_id: order.id,
              p_old_payment_method_id: null,
              p_new_payment_method_id: data.sales_payment_method_id,
              p_total_amount: data.total_amount,
            });
          }
        }
      }
      
      const { data: result, error } = await supabase
        .from('sales_orders')
        .update({
          order_number: data.order_number,
          client_name: data.client_name,
          client_phone: data.client_phone,
          client_state: data.client_state || null,
          platform: data.platform,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          total_amount: data.total_amount,
          payment_status: data.payment_status,
          order_date: data.order_date,
          description: data.description,
          risk_level: data.risk_level,
          sales_payment_method_id: data.sales_payment_method_id || null,
          product_id: data.product_id || null,
          wallet_id: data.warehouse_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (data) => {
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.SALES_ORDER_EDITED,
        entityType: EntityTypes.SALES_ORDER,
        entityId: order.id,
        module: Modules.SALES,
        metadata: { order_number: data.order_number }
      });
      
      toast({ title: "Success", description: "Sales order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stock'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Error updating sales order:', error);
      toast({ title: "Error", description: error.message || "Failed to update sales order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.order_number.trim()) {
      toast({ title: "Error", description: "Order number is required", variant: "destructive" });
      return;
    }
    
    if (!formData.client_name.trim()) {
      toast({ title: "Error", description: "Customer name is required", variant: "destructive" });
      return;
    }

    updateSalesOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate total amount when quantity or price changes
      if (field === 'quantity' || field === 'price_per_unit') {
        updated.total_amount = updated.quantity * updated.price_per_unit;
      }
      
      return updated;
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sales Order - {order.order_number}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Order Number *</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Order Date *</Label>
              <Input
                type="date"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Customer Name *</Label>
              <Input
                value={formData.client_name}
                onChange={(e) => handleInputChange('client_name', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Customer Phone</Label>
              <Input
                value={formData.client_phone}
                onChange={(e) => handleInputChange('client_phone', e.target.value)}
              />
            </div>

            <div>
              <Label>Product</Label>
              <Select 
                value={formData.product_id} 
                onValueChange={(value) => handleInputChange('product_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <WalletSelector
                value={formData.warehouse_id}
                onValueChange={(value) => handleInputChange('warehouse_id', value)}
                label="Wallet/Platform"
                placeholder="Select wallet..."
                filterByType="USDT"
              />
            </div>

            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Price Per Unit *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Total Amount</Label>
              <Input
                type="number"
                value={formData.total_amount}
                readOnly
                className="bg-muted font-semibold"
              />
            </div>

            <div>
              <Label>Risk Level</Label>
              <Select 
                value={formData.risk_level} 
                onValueChange={(value) => handleInputChange('risk_level', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Method</Label>
              <Select 
                value={formData.sales_payment_method_id} 
                onValueChange={(value) => handleInputChange('sales_payment_method_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[100] max-h-60 overflow-y-auto">
                  {paymentMethods?.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {(method as any).nickname || `${method.bank_accounts?.account_name || method.type} - ${method.bank_accounts?.bank_name || ''}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Status</Label>
              <Select 
                value={formData.payment_status} 
                onValueChange={(value) => handleInputChange('payment_status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Platform</Label>
              <Input
                value={formData.platform}
                onChange={(e) => handleInputChange('platform', e.target.value)}
                placeholder="e.g., Binance P2P"
              />
            </div>

            <div>
              <Label>State</Label>
              <Select
                value={formData.client_state}
                onValueChange={(value) => handleInputChange('client_state', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {INDIAN_STATES_AND_UTS.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={updateSalesOrderMutation.isPending}
            >
              {updateSalesOrderMutation.isPending ? "Updating..." : "Update Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
