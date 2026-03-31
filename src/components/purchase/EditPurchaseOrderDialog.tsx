import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WalletSelector } from "@/components/stock/WalletSelector";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, CheckCircle2, AlertCircle } from "lucide-react";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function EditPurchaseOrderDialog({ open, onOpenChange, order }: EditPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    order_number: '',
    supplier_name: '',
    contact_number: '',
    total_amount: 0,
    order_date: '',
    description: '',
    assigned_to: '',
    tds_option: 'NO_TDS',
    pan_number: '',
    quantity: 0,
    price_per_unit: 0,
    warehouse_id: '',
    bank_account_id: '',
    product_id: '',
  });

  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);

  // Fetch employees for assignment
  const { data: employees } = useQuery({
    queryKey: ['hr_employees_assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_employees')
        .select('id, first_name, last_name, badge_id')
        .eq('is_active', true)
        .order('first_name');
      if (error) throw error;
      return data?.map(e => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name || ''}`.trim(),
        employee_id: e.badge_id
      }));
    },
    enabled: open,
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

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch existing payment splits
  const { data: existingSplits } = useQuery({
    queryKey: ['payment_splits_edit', order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_payment_splits')
        .select('id, amount, bank_account_id')
        .eq('purchase_order_id', order.id);
      if (error || !data?.length) return [];
      return data;
    },
    enabled: !!order?.id && open,
  });

  // Fallback wallet for legacy orders where wallet_id/warehouse_id was not persisted
  const { data: existingWalletCredit } = useQuery({
    queryKey: ['purchase_wallet_credit', order?.id],
    queryFn: async () => {
      if (!order?.id) return null;
      const { data } = await supabase
        .from('wallet_transactions')
        .select('wallet_id')
        .in('reference_type', ['PURCHASE', 'PURCHASE_ORDER'])
        .eq('reference_id', order.id)
        .eq('transaction_type', 'CREDIT')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.wallet_id || null;
    },
    enabled: !!order?.id && open,
  });

  useEffect(() => {
    if (order) {
      const firstItem = order.purchase_order_items?.[0];
      const quantity = firstItem?.quantity || order.quantity || 0;
      const pricePerUnit = firstItem?.unit_price || order.price_per_unit || (order.total_amount / quantity) || 0;
      const warehouseId = order.wallet_id || order.wallet?.id || firstItem?.warehouse_id || existingWalletCredit || '';
      const productId = firstItem?.product_id || '';

      let tdsOption = 'NO_TDS';
      if (order.tds_applied) {
        const tdsRate = order.tds_amount / order.total_amount;
        if (Math.abs(tdsRate - 0.01) < 0.001) {
          tdsOption = 'TDS_1_PERCENT';
        } else if (Math.abs(tdsRate - 0.20) < 0.001) {
          tdsOption = 'TDS_20_PERCENT';
        }
      }

      setFormData({
        order_number: order.order_number || '',
        supplier_name: order.supplier_name || '',
        contact_number: order.contact_number || '',
        total_amount: order.total_amount || 0,
        order_date: order.order_date || '',
        description: order.description || '',
        assigned_to: order.assigned_to || '',
        tds_option: tdsOption,
        pan_number: order.pan_number || '',
        quantity: quantity,
        price_per_unit: pricePerUnit,
        warehouse_id: warehouseId,
        bank_account_id: order.bank_account_id || '',
        product_id: productId,
      });
    }
  }, [order, existingWalletCredit]);

  // Initialize splits from existing data
  useEffect(() => {
    if (existingSplits && existingSplits.length > 0) {
      // Existing split payment records found — load them faithfully
      setIsMultiplePayments(existingSplits.length > 1);
      setPaymentSplits(existingSplits.map((s: any) => ({
        bank_account_id: s.bank_account_id || '',
        amount: String(s.amount || ''),
      })));
    } else if (order?.bank_account_id) {
      // Single bank account order — initialize with that bank and net payable
      setIsMultiplePayments(false);
      setPaymentSplits([{ 
        bank_account_id: order.bank_account_id, 
        amount: '' 
      }]);
    } else {
      setIsMultiplePayments(false);
      setPaymentSplits([{ bank_account_id: '', amount: '' }]);
    }
  }, [existingSplits, order]);

  // Calculate amounts based on TDS option
  // Use formData.total_amount (preserves original value, only recalculated when user changes qty/price)
  const totalAmount = formData.total_amount;
  const tdsRate = formData.tds_option === "TDS_1_PERCENT" ? 0.01 : formData.tds_option === "TDS_20_PERCENT" ? 0.20 : 0;
  const tdsAmount = totalAmount * tdsRate;
  const netPayableAmount = totalAmount - tdsAmount;
  const tdsApplied = formData.tds_option !== "NO_TDS";

  // Split payment allocation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) =>
      sum + (parseFloat(s.amount) || 0), 0);
    const remaining = netPayableAmount - totalAllocated;
    const isValid = Math.abs(remaining) < 0.01 && paymentSplits.every(s => s.bank_account_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, netPayableAmount]);

  const addPaymentSplit = () => {
    // Prevent adding rows if allocation already meets or exceeds net payable
    if (splitAllocation.remaining <= 0) {
      toast({ title: "Cannot add more", description: "Total allocation already meets or exceeds the net payable amount", variant: "destructive" });
      return;
    }
    setPaymentSplits(prev => [...prev, { bank_account_id: '', amount: '' }]);
  };

  const removePaymentSplit = (index: number) => {
    setPaymentSplits(prev => prev.filter((_, i) => i !== index));
  };

  const updatePaymentSplit = (index: number, field: keyof PaymentSplit, value: string) => {
    setPaymentSplits(prev => prev.map((split, i) =>
      i === index ? { ...split, [field]: value } : split
    ));
  };

  const updatePurchaseOrderMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const selectedBankId = isMultiplePayments
        ? paymentSplits[0]?.bank_account_id || null
        : data.bank_account_id || null;

      const isCompleted = order.status === 'COMPLETED';

      // For completed orders, reconcile all dependent records (bank, wallet, fees)
      if (isCompleted) {
        const oldNetPayable = order.tds_applied && order.net_payable_amount
          ? order.net_payable_amount
          : order.total_amount;

        const oldQuantity = order.purchase_order_items?.[0]?.quantity || order.quantity || 0;
        const oldWalletId = order.wallet_id || order.wallet?.id || order.purchase_order_items?.[0]?.warehouse_id || null;

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

        // Get product code for asset_code — use selected product if changed
        let productCode = order.purchase_order_items?.[0]?.products?.code || 'USDT';
        if (orderData.product_id) {
          const { data: selectedProd } = await supabase.from('products').select('code').eq('id', orderData.product_id).single();
          if (selectedProd?.code) productCode = selectedProd.code;
        }

        // Build split payments JSON if using multiple payments
        const splitPaymentsJson = isMultiplePayments && paymentSplits.length > 0
          ? paymentSplits
              .filter(s => s.bank_account_id && parseFloat(s.amount) > 0)
              .map(s => ({ bank_account_id: s.bank_account_id, amount: parseFloat(s.amount) }))
          : null;

        const { data: reconcileResult, error: reconcileError } = await supabase.rpc('reconcile_purchase_order_edit', {
          p_order_id: order.id,
          p_order_number: data.order_number,
          p_order_date: data.order_date,
          p_supplier_name: data.supplier_name,
          p_old_bank_account_id: order.bank_account_id || null,
          p_new_bank_account_id: isMultiplePayments ? null : selectedBankId,
          p_old_net_payable: oldNetPayable,
          p_new_net_payable: netPayableAmount,
          p_old_wallet_id: oldWalletId,
          p_new_wallet_id: data.warehouse_id || null,
          p_old_quantity: oldQuantity,
          p_new_quantity: data.quantity,
          p_is_off_market: isOffMarket,
          p_fee_percentage: feePercentage,
          p_product_code: productCode,
          p_payment_splits: splitPaymentsJson,
        });

        if (reconcileError) {
          console.error('Reconciliation error:', reconcileError);
          throw new Error(`Failed to reconcile: ${reconcileError.message}`);
        }

        const result = reconcileResult as any;
        if (result && !result.success) {
          throw new Error(result.error || 'Reconciliation failed');
        }

        
      }

      const { data: result, error } = await supabase
        .from('purchase_orders')
        .update({
          order_number: data.order_number,
          supplier_name: data.supplier_name,
          contact_number: data.contact_number,
          total_amount: totalAmount,
          order_date: data.order_date,
          description: data.description,
          assigned_to: data.assigned_to,
          tds_applied: tdsApplied,
          pan_number: data.pan_number,
          tds_amount: tdsAmount,
          net_payable_amount: netPayableAmount,
          total_paid: netPayableAmount,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          wallet_id: data.warehouse_id || null,
          bank_account_id: selectedBankId,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .select()
        .single();

      if (error) throw error;

      // Update purchase order items if they exist
      if (order.purchase_order_items?.length > 0) {
        const firstItemId = order.purchase_order_items[0].id;
        await supabase
          .from('purchase_order_items')
          .update({
            quantity: data.quantity,
            unit_price: data.price_per_unit,
            total_price: totalAmount,
            warehouse_id: data.warehouse_id || null,
            product_id: data.product_id || null,
          })
          .eq('id', firstItemId);
      }

      // Payment splits are now handled inside the reconcile_purchase_order_edit RPC
      // (SECURITY DEFINER) to prevent silent RLS failures causing duplicate accumulation

      // ── TDS CASCADING UPDATES ──
      // When TDS details change, update all dependent records
      const oldTdsApplied = !!order.tds_applied;
      const oldPanNumber = order.pan_number || '';
      const oldTdsAmount = order.tds_amount || 0;
      const tdsChanged = (tdsApplied !== oldTdsApplied) || 
                          (data.pan_number !== oldPanNumber) || 
                          (Math.abs(tdsAmount - oldTdsAmount) > 0.01);

      if (tdsChanged) {
        const supplierName = data.supplier_name.trim();

        // 1. Update counterparty_pan_records
        if (tdsApplied && data.pan_number && formData.tds_option === 'TDS_1_PERCENT') {
          // Upsert PAN for this counterparty
          const { data: existingPan } = await supabase
            .from('counterparty_pan_records')
            .select('id')
            .eq('counterparty_nickname', supplierName)
            .maybeSingle();

          if (existingPan) {
            await supabase
              .from('counterparty_pan_records')
              .update({ pan_number: data.pan_number, updated_at: new Date().toISOString() })
              .eq('id', existingPan.id);
          } else {
            await supabase
              .from('counterparty_pan_records')
              .insert({ counterparty_nickname: supplierName, pan_number: data.pan_number });
          }
        } else if (!tdsApplied || formData.tds_option === 'TDS_20_PERCENT') {
          // If switching to NO_TDS or 20% (no PAN), don't delete the PAN record 
          // (it may be used by other orders), but clear PAN from this order
        }

        // 2. Update client record's PAN if a matching client exists
        const { data: matchingClients } = await supabase
          .from('clients')
          .select('id, pan_card_number')
          .ilike('name', supplierName)
          .limit(1);

        if (matchingClients && matchingClients.length > 0) {
          const client = matchingClients[0];
          if (tdsApplied && data.pan_number && formData.tds_option === 'TDS_1_PERCENT') {
            // Update client PAN if it changed
            if (client.pan_card_number !== data.pan_number) {
              await supabase
                .from('clients')
                .update({ pan_card_number: data.pan_number, updated_at: new Date().toISOString() })
                .eq('id', client.id);
            }
          }
          // Note: We don't clear client PAN when switching to NO_TDS/20%
          // because the PAN is a master record that may be used across orders
        }

        // 3. Update all other purchase orders for the same supplier with same old PAN
        // to ensure consistency (only if PAN actually changed and new PAN is valid)
        if (oldPanNumber && data.pan_number && oldPanNumber !== data.pan_number && formData.tds_option === 'TDS_1_PERCENT') {
          await supabase
            .from('purchase_orders')
            .update({ pan_number: data.pan_number })
            .eq('supplier_name', supplierName)
            .eq('pan_number', oldPanNumber)
            .neq('id', order.id);
        }
      }

      return result;
    },
    onSuccess: (data) => {
      // Log the edit action with detailed metadata for audit trail
      const changedFields: string[] = [];
      if (data.supplier_name !== order.supplier_name) changedFields.push('supplier_name');
      if (data.total_amount !== order.total_amount) changedFields.push('total_amount');
      if (data.bank_account_id !== order.bank_account_id) changedFields.push('bank_account');
      if (data.wallet_id !== (order.wallet_id || order.wallet?.id)) changedFields.push('wallet');
      if (data.tds_applied !== order.tds_applied) changedFields.push('tds');
      if (data.pan_number !== order.pan_number) changedFields.push('pan_number');
      if (data.order_date !== order.order_date) changedFields.push('order_date');
      if (data.description !== order.description) changedFields.push('description');
      if (isMultiplePayments) changedFields.push('split_payments');

      logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_ORDER_EDITED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: order.id,
        module: Modules.PURCHASE,
        metadata: { 
          order_number: data.order_number,
          changed_fields: changedFields,
          old_total: order.total_amount,
          new_total: data.total_amount,
          old_bank: order.bank_account_id,
          new_bank: data.bank_account_id,
          split_count: isMultiplePayments ? paymentSplits.length : 0,
        }
      });

      toast({ title: "Success", description: "Purchase order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stock'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['counterparty-pan-records'] });
      queryClient.invalidateQueries({ queryKey: ['tds-records'] });
      queryClient.invalidateQueries({ queryKey: ['client-tds-records'] });
      queryClient.invalidateQueries({ queryKey: ['tax-management'] });
      // Also invalidate activity timeline so the new edit shows immediately
      queryClient.invalidateQueries({ queryKey: ['activity_timeline'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update purchase order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.order_number.trim()) {
      toast({ title: "Error", description: "Order number is required", variant: "destructive" });
      return;
    }

    if (!formData.supplier_name.trim()) {
      toast({ title: "Error", description: "Supplier name is required", variant: "destructive" });
      return;
    }

    if (formData.tds_option === "TDS_1_PERCENT" && !formData.pan_number.trim()) {
      toast({ title: "Error", description: "PAN number is required for 1% TDS", variant: "destructive" });
      return;
    }

    if (isMultiplePayments) {
      const missingBank = paymentSplits.some(s => !s.bank_account_id);
      const missingAmount = paymentSplits.some(s => !parseFloat(s.amount));
      if (missingBank) {
        toast({ title: "Error", description: "Please select a bank account for all payment splits", variant: "destructive" });
        return;
      }
      if (missingAmount) {
        toast({ title: "Error", description: "Please enter an amount for all payment splits", variant: "destructive" });
        return;
      }
      if (Math.abs(splitAllocation.remaining) >= 0.01) {
        toast({ title: "Error", description: `Split payment allocation must match net payable amount. Remaining: ₹${splitAllocation.remaining.toFixed(2)}`, variant: "destructive" });
        return;
      }
      const bankIds = paymentSplits.map(s => s.bank_account_id);
      if (new Set(bankIds).size !== bankIds.length) {
        toast({ title: "Error", description: "Each bank account can only be used once", variant: "destructive" });
        return;
      }
    }

    updatePurchaseOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-recalculate total_amount only when user explicitly changes quantity or price_per_unit
      if (field === 'quantity' || field === 'price_per_unit') {
        updated.total_amount = updated.quantity * updated.price_per_unit;
      }
      return updated;
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Edit Purchase Order - {order.order_number}</DialogTitle>
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
              <Label>Supplier Name *</Label>
              <Input
                value={formData.supplier_name}
                onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={(e) => handleInputChange('contact_number', e.target.value)}
              />
            </div>

            <div>
              <Label>Assigned To</Label>
              <Select
                value={formData.assigned_to}
                onValueChange={(value) => handleInputChange('assigned_to', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.name}>
                      {employee.name} ({employee.employee_id})
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
              <Label>Product/Asset *</Label>
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
                value={`₹${totalAmount.toFixed(2)}`}
                readOnly
                className="bg-muted font-semibold"
              />
            </div>
          </div>

          {/* TDS Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <Label className="text-lg font-semibold">TDS Options</Label>

            <Select
              value={formData.tds_option}
              onValueChange={(value) => handleInputChange('tds_option', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select TDS option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NO_TDS">No TDS Deduction</SelectItem>
                <SelectItem value="TDS_1_PERCENT">TDS @ 1% (PAN Required)</SelectItem>
                <SelectItem value="TDS_20_PERCENT">TDS @ 20% (No PAN)</SelectItem>
              </SelectContent>
            </Select>

            {formData.tds_option === "TDS_1_PERCENT" && (
              <div>
                <Label>PAN Number *</Label>
                <Input
                  value={formData.pan_number}
                  onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                  placeholder="Enter PAN number"
                  required
                />
              </div>
            )}

            {formData.tds_option !== "NO_TDS" && (
              <div className="space-y-2 bg-muted/50 p-3 rounded-md">
                <div className="flex justify-between text-sm">
                  <span>Total Amount:</span>
                  <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>TDS Rate:</span>
                  <span className="font-medium">{formData.tds_option === "TDS_1_PERCENT" ? "1%" : "20%"}</span>
                </div>
                <div className="flex justify-between text-sm text-orange-600">
                  <span>TDS Amount:</span>
                  <span className="font-medium">₹{tdsAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Net Payable Amount:</span>
                  <span className="text-primary">₹{netPayableAmount.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          {/* Bank Account with Split Payment */}
          <div className="space-y-4 border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Bank Account (Payment)</Label>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="edit_split_payment"
                  checked={isMultiplePayments}
                  onCheckedChange={(checked) => {
                    setIsMultiplePayments(checked === true);
                    if (checked) {
                      setPaymentSplits([{
                        bank_account_id: formData.bank_account_id || '',
                        amount: netPayableAmount.toFixed(2)
                      }]);
                    } else {
                      setPaymentSplits([{ bank_account_id: '', amount: '' }]);
                    }
                  }}
                />
                <Label htmlFor="edit_split_payment" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                  Split Payment
                </Label>
              </div>
            </div>

            {!isMultiplePayments ? (
              <Select
                value={formData.bank_account_id}
                onValueChange={(value) => handleInputChange('bank_account_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - ₹{Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                      <div className="text-muted-foreground text-xs mb-1">Net Payable</div>
                      <div className="font-semibold">₹{netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
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
                      <div className="col-span-7">Bank Account</div>
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
                            value={split.bank_account_id}
                            onValueChange={(value) => updatePaymentSplit(index, 'bank_account_id', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select bank account" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                              {bankAccounts?.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.account_name} - ₹{Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                    {splitAllocation.remaining <= 0 ? 'Fully Allocated' : 'Add Another Bank'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updatePurchaseOrderMutation.isPending}>
              {updatePurchaseOrderMutation.isPending ? "Updating..." : "Update Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
