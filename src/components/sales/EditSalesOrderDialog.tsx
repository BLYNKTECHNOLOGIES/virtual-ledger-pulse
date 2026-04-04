import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Minus, CheckCircle2, AlertCircle } from "lucide-react";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface SalesPaymentSplit {
  payment_method_id: string;
  amount: string;
}

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
  
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<SalesPaymentSplit[]>([{ payment_method_id: '', amount: '' }]);

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

  // Fetch wallets for matching
  const { data: wallets } = useQuery<{ id: string; wallet_name: string }[]>({
    queryKey: ['wallets-for-edit'],
    queryFn: async (): Promise<{ id: string; wallet_name: string }[]> => {
      const { data, error } = await (supabase as any).from('wallets').select('id, wallet_name').eq('status', 'ACTIVE');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods', order?.sales_payment_method_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          payment_gateway,
          is_active,
          bank_accounts:bank_account_id(
            id,
            account_name,
            bank_name,
            status
          )
        `);
      if (error) throw error;

      const selectedPaymentMethodId = order?.sales_payment_method_id;

      return (data || []).filter((method: any) => {
        if (method.id === selectedPaymentMethodId) return true;
        if (!method.is_active) return false;
        if (method.payment_gateway) return true;
        return method.bank_accounts?.status === 'ACTIVE';
      });
    },
    enabled: open,
  });

  // Fetch existing split records
  const { data: existingSplits } = useQuery({
    queryKey: ['sales_order_edit_payment_splits', order?.id],
    queryFn: async () => {
      if (!order?.id) return [];
      const { data, error } = await supabase
        .from('sales_order_payment_splits')
        .select('id, amount, bank_account_id, payment_method_id, is_gateway')
        .eq('sales_order_id', order.id)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!order?.id,
  });

  const formatPaymentMethodLabel = (method: any) => {
    if (!method) return 'Unknown payment method';
    if (method.nickname) return method.nickname;
    if (method.type === 'UPI' && method.upi_id) {
      return `${method.upi_id}${method.risk_category ? ` (${method.risk_category})` : ''}`;
    }
    if (method.bank_accounts?.account_name) {
      return `${method.bank_accounts.account_name}${method.risk_category ? ` (${method.risk_category})` : ''}`;
    }
    return `${method.type || 'Unknown'}${method.risk_category ? ` (${method.risk_category})` : ''}`;
  };

  useEffect(() => {
    if (order) {
      const walletId = order.wallet_id || order.wallet?.id || '';
      setOriginalWalletId(walletId);
      setOriginalPaymentMethodId(order.sales_payment_method_id || null);

      let productId = order.product_id || '';
      if (!productId && products?.length) {
        const desc = (order.description || '').toUpperCase();
        const platform = (order.platform || '').toUpperCase();
        const matchedProduct = products.find(p => {
          const code = (p.code || '').toUpperCase();
          return desc.includes(code) || platform.includes(code) || code === 'USDT';
        });
        if (matchedProduct) productId = matchedProduct.id;
      }

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
        order_date: order.order_date 
          ? (order.order_date.length <= 10 ? `${order.order_date}T00:00` : order.order_date.slice(0, 16))
          : '',
        description: order.description || '',
        risk_level: order.risk_level || 'HIGH',
        sales_payment_method_id: order.sales_payment_method_id || '',
        product_id: productId,
        warehouse_id: walletId,
      });
    }
  }, [order, products]);

  // Initialize splits from existing data
  useEffect(() => {
    if (existingSplits && existingSplits.length > 0) {
      setIsMultiplePayments(existingSplits.length > 1 || !!order?.is_split_payment);
      setPaymentSplits(existingSplits.map((s: any) => ({
        payment_method_id: s.payment_method_id || '',
        amount: String(s.amount || ''),
      })));
    } else if (order?.is_split_payment) {
      setIsMultiplePayments(true);
      setPaymentSplits([{ payment_method_id: '', amount: '' }]);
    } else {
      setIsMultiplePayments(false);
      setPaymentSplits([{ payment_method_id: order?.sales_payment_method_id || '', amount: '' }]);
    }
  }, [existingSplits, order]);

  const totalAmount = formData.total_amount;

  // Split payment allocation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) =>
      sum + (parseFloat(s.amount) || 0), 0);
    const remaining = totalAmount - totalAllocated;
    const isValid = Math.abs(remaining) < 0.01 && paymentSplits.every(s => s.payment_method_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, totalAmount]);

  const addPaymentSplit = () => {
    if (splitAllocation.remaining <= 0) {
      toast({ title: "Cannot add more", description: "Total allocation already meets or exceeds the total amount", variant: "destructive" });
      return;
    }
    setPaymentSplits(prev => [...prev, { payment_method_id: '', amount: '' }]);
  };

  const removePaymentSplit = (index: number) => {
    setPaymentSplits(prev => prev.filter((_, i) => i !== index));
  };

  const updatePaymentSplit = (index: number, field: keyof SalesPaymentSplit, value: string) => {
    setPaymentSplits(prev => prev.map((split, i) =>
      i === index ? { ...split, [field]: value } : split
    ));
  };

  const updateSalesOrderMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const isCompleted = order.payment_status === 'COMPLETED';
      const walletChanged = originalWalletId && data.warehouse_id && originalWalletId !== data.warehouse_id;
      const quantityChanged = order.quantity !== data.quantity;
      const amountChanged = order.total_amount !== data.total_amount;
      const paymentMethodChanged = originalPaymentMethodId !== data.sales_payment_method_id;

      // ── Handle non-split completed order reconciliation (existing logic) ──
      if (!isMultiplePayments && isCompleted && (amountChanged || quantityChanged || walletChanged)) {
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

        const productCode = order.products?.code || order.product_code || 'USDT';

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
          p_product_code: productCode,
        });

        if (reconcileError) throw new Error(`Failed to reconcile: ${reconcileError.message}`);
        const result = reconcileResult as any;
        if (result && !result.success) throw new Error(result.error || 'Reconciliation failed');

        if (paymentMethodChanged) {
          const { data: pmResult, error: pmError } = await supabase.rpc('handle_sales_order_payment_method_change', {
            p_order_id: order.id,
            p_old_payment_method_id: originalPaymentMethodId,
            p_new_payment_method_id: data.sales_payment_method_id || null,
            p_total_amount: data.total_amount
          });
          if (pmError) throw new Error(`Failed to transfer payment method: ${pmError.message}`);
          if (pmResult && !(pmResult as any).success) throw new Error((pmResult as any).error);
        }
      } else if (!isMultiplePayments && isCompleted) {
        if (paymentMethodChanged) {
          const { data: pmResult, error: pmError } = await supabase.rpc('handle_sales_order_payment_method_change', {
            p_order_id: order.id,
            p_old_payment_method_id: originalPaymentMethodId,
            p_new_payment_method_id: data.sales_payment_method_id || null,
            p_total_amount: data.total_amount
          });
          if (pmError) throw new Error(`Failed to transfer payment method: ${pmError.message}`);
          if (pmResult && !(pmResult as any).success) throw new Error((pmResult as any).error);
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
            await supabase.rpc('handle_sales_order_payment_method_change', {
              p_order_id: order.id,
              p_old_payment_method_id: null,
              p_new_payment_method_id: data.sales_payment_method_id,
              p_total_amount: data.total_amount,
            });
          }
        }
      }

      // ── Handle split payment updates for completed orders ──
      if (isMultiplePayments && isCompleted) {
        // 1. Delete old bank transactions & pending settlements for this order's splits
        await supabase
          .from('bank_transactions')
          .delete()
          .eq('reference_number', order.order_number)
          .eq('transaction_type', 'INCOME');
        
        await supabase
          .from('pending_settlements')
          .delete()
          .eq('sales_order_id', order.id);

        // 2. Delete existing split records
        await supabase
          .from('sales_order_payment_splits')
          .delete()
          .eq('sales_order_id', order.id);

        // 3. Create new split records + bank transactions/pending settlements
        let hasGateway = false;
        for (const split of paymentSplits) {
          if (!split.payment_method_id || !parseFloat(split.amount)) continue;

          const pm = paymentMethods?.find((m: any) => m.id === split.payment_method_id);
          const isGateway = Boolean(pm?.payment_gateway);
          const bankAccountId = pm?.bank_account_id || (pm?.bank_accounts as any)?.id || null;

          if (isGateway) hasGateway = true;

          // Insert split record
          await supabase.from('sales_order_payment_splits').insert({
            sales_order_id: order.id,
            bank_account_id: bankAccountId,
            amount: parseFloat(split.amount),
            payment_method_id: split.payment_method_id,
            is_gateway: isGateway,
          });

          // Create financial entry
          if (isGateway) {
            await supabase.from('pending_settlements').insert({
              sales_order_id: order.id,
              payment_method_id: split.payment_method_id,
              amount: parseFloat(split.amount),
              status: 'PENDING',
              order_number: data.order_number,
              client_name: data.client_name,
              order_date: data.order_date,
            });
          } else if (bankAccountId) {
            await supabase.from('bank_transactions').insert({
              bank_account_id: bankAccountId,
              transaction_type: 'INCOME',
              amount: parseFloat(split.amount),
              description: `Sales Order ${data.order_number} - Split Payment (${pm?.nickname || 'Direct Bank'})`,
              reference_number: data.order_number,
              transaction_date: data.order_date || new Date().toISOString(),
              category: 'SALES',
              related_account_name: data.client_name,
            });
          }
        }

        // Update the sales order with split payment flag
        await supabase.from('sales_orders').update({
          is_split_payment: true,
          settlement_status: hasGateway ? 'PENDING' : (order.settlement_status || null),
        }).eq('id', order.id);
      }

      // If switching from split to single, clean up splits
      if (!isMultiplePayments && order?.is_split_payment) {
        // Delete old split financial entries
        await supabase
          .from('bank_transactions')
          .delete()
          .eq('reference_number', order.order_number)
          .eq('transaction_type', 'INCOME');
        
        await supabase
          .from('pending_settlements')
          .delete()
          .eq('sales_order_id', order.id);

        await supabase
          .from('sales_order_payment_splits')
          .delete()
          .eq('sales_order_id', order.id);

        await supabase.from('sales_orders').update({
          is_split_payment: false,
        }).eq('id', order.id);
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
          sales_payment_method_id: isMultiplePayments ? null : (data.sales_payment_method_id || null),
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
      logActionWithCurrentUser({
        actionType: ActionTypes.SALES_ORDER_EDITED,
        entityType: EntityTypes.SALES_ORDER,
        entityId: order.id,
        module: Modules.SALES,
        metadata: { 
          order_number: data.order_number,
          split_count: isMultiplePayments ? paymentSplits.length : 0,
        }
      });
      
      toast({ title: "Success", description: "Sales order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pending_settlements'] });
      queryClient.invalidateQueries({ queryKey: ['sales_order_edit_payment_splits'] });
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

    if (isMultiplePayments) {
      const missingMethod = paymentSplits.some(s => !s.payment_method_id);
      const missingAmount = paymentSplits.some(s => !parseFloat(s.amount));
      if (missingMethod || missingAmount) {
        toast({ title: "Error", description: "All split payments must have a payment method and amount", variant: "destructive" });
        return;
      }
      if (!splitAllocation.isValid) {
        toast({ title: "Error", description: `Split amounts must equal ₹${totalAmount.toFixed(2)}. Remaining: ₹${splitAllocation.remaining.toFixed(2)}`, variant: "destructive" });
        return;
      }
    }

    updateSalesOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      if (field === 'quantity' || field === 'price_per_unit') {
        updated.total_amount = updated.quantity * updated.price_per_unit;
      }

      if (field === 'warehouse_id' && wallets) {
        const selectedWallet = wallets.find(w => w.id === value);
        if (selectedWallet) {
          updated.platform = selectedWallet.wallet_name.split(' ')[0];
        }
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
              <Label>Order Date & Time *</Label>
              <Input
                type="datetime-local"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
                required
                disabled={order?.order_number?.startsWith('SO-TRM')}
              />
              {order?.order_number?.startsWith('SO-TRM') && (
                <p className="text-xs text-muted-foreground mt-1">Terminal-synced orders use actual Binance order time (not editable)</p>
              )}
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
                readOnly
                className="bg-muted"
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

          {/* Payment Method with Split Payment */}
          <div className="space-y-4 border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Payment Method</Label>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="edit_split_sales_payment"
                  checked={isMultiplePayments}
                  onCheckedChange={(checked) => {
                    setIsMultiplePayments(checked === true);
                    if (checked) {
                      setPaymentSplits([{
                        payment_method_id: formData.sales_payment_method_id || '',
                        amount: totalAmount.toFixed(2)
                      }]);
                    } else {
                      setPaymentSplits([{ payment_method_id: '', amount: '' }]);
                    }
                  }}
                />
                <Label htmlFor="edit_split_sales_payment" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                  Split Payment
                </Label>
              </div>
            </div>

            {!isMultiplePayments ? (
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
                      {formatPaymentMethodLabel(method)}
                      {method.id === order.sales_payment_method_id && !(method as any).is_active ? ' (Inactive)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="font-medium">Payment Distribution</Label>
                      {splitAllocation.isValid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </div>

                  {/* Status Bar */}
                  <div className="grid grid-cols-3 gap-4 text-sm bg-background/80 rounded-lg p-3 border">
                    <div className="text-center">
                      <div className="text-muted-foreground text-xs mb-1">Total Amount</div>
                      <div className="font-semibold">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="text-center border-x">
                      <div className="text-muted-foreground text-xs mb-1">Allocated</div>
                      <div className="font-medium">₹{splitAllocation.totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground text-xs mb-1">Remaining</div>
                      <div className={`font-semibold ${splitAllocation.isValid ? "text-green-600" : "text-destructive"}`}>
                        ₹{splitAllocation.remaining.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Payment Rows */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-3 text-xs text-muted-foreground px-1">
                      <div className="col-span-4">Amount (₹)</div>
                      <div className="col-span-7">Payment Method</div>
                      <div className="col-span-1"></div>
                    </div>

                    {paymentSplits.map((split, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-4">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={split.amount}
                            onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="col-span-7">
                          <Select
                            value={split.payment_method_id}
                            onValueChange={(value) => updatePaymentSplit(index, 'payment_method_id', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment method" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-[100] max-h-60 overflow-y-auto">
                              {paymentMethods?.map((method) => (
                                <SelectItem key={method.id} value={method.id}>
                                  {formatPaymentMethodLabel(method)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removePaymentSplit(index)}
                            disabled={paymentSplits.length === 1}
                            className="h-8 w-8"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPaymentSplit}
                    disabled={splitAllocation.remaining <= 0}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {splitAllocation.remaining <= 0 ? 'Fully Allocated' : 'Add Another Payment Method'}
                  </Button>
                </CardContent>
              </Card>
            )}
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