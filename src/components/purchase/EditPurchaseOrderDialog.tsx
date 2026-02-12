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
  });

  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);

  // Fetch employees for assignment
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_id')
        .eq('status', 'ACTIVE')
        .order('name');
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

  useEffect(() => {
    if (order) {
      const firstItem = order.purchase_order_items?.[0];
      const quantity = firstItem?.quantity || order.quantity || 0;
      const pricePerUnit = firstItem?.unit_price || order.price_per_unit || (order.total_amount / quantity) || 0;
      const warehouseId = order.wallet_id || order.wallet?.id || firstItem?.warehouse_id || '';

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
      });
    }
  }, [order]);

  // Initialize splits from existing data
  useEffect(() => {
    if (existingSplits && existingSplits.length > 0) {
      setIsMultiplePayments(existingSplits.length > 1);
      setPaymentSplits(existingSplits.map((s: any) => ({
        bank_account_id: s.bank_account_id || '',
        amount: String(s.amount || ''),
      })));
    } else if (order?.bank_account_id) {
      setIsMultiplePayments(false);
      setPaymentSplits([{ bank_account_id: '', amount: '' }]);
    }
  }, [existingSplits, order]);

  // Calculate amounts based on TDS option
  const totalAmount = formData.quantity * formData.price_per_unit;
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

      const isCompleted = order.status === 'COMPLETED' || order.order_status === 'completed';

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

        // Get product code for asset_code
        const productCode = order.purchase_order_items?.[0]?.products?.code || 'USDT';

        const { data: reconcileResult, error: reconcileError } = await supabase.rpc('reconcile_purchase_order_edit', {
          p_order_id: order.id,
          p_order_number: data.order_number,
          p_old_total_amount: order.total_amount,
          p_new_total_amount: totalAmount,
          p_old_net_payable: oldNetPayable,
          p_new_net_payable: netPayableAmount,
          p_old_quantity: oldQuantity,
          p_new_quantity: data.quantity,
          p_old_wallet_id: oldWalletId,
          p_new_wallet_id: data.warehouse_id || null,
          p_old_bank_account_id: order.bank_account_id || null,
          p_new_bank_account_id: selectedBankId,
          p_supplier_name: data.supplier_name,
          p_order_date: data.order_date,
          p_is_off_market: isOffMarket,
          p_fee_percentage: feePercentage,
          p_product_code: productCode,
        });

        if (reconcileError) {
          console.error('Reconciliation error:', reconcileError);
          throw new Error(`Failed to reconcile: ${reconcileError.message}`);
        }

        const result = reconcileResult as any;
        if (result && !result.success) {
          throw new Error(result.error || 'Reconciliation failed');
        }

        console.log('✅ Purchase order reconciliation completed:', result);
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
          })
          .eq('id', firstItemId);
      }

      // Handle payment splits
      // Delete existing splits
      await supabase
        .from('purchase_order_payment_splits')
        .delete()
        .eq('purchase_order_id', order.id);

      if (isMultiplePayments && paymentSplits.length > 0) {
        const splitsToInsert = paymentSplits
          .filter(s => s.bank_account_id && parseFloat(s.amount) > 0)
          .map(s => ({
            purchase_order_id: order.id,
            bank_account_id: s.bank_account_id,
            amount: parseFloat(s.amount),
          }));
        if (splitsToInsert.length > 0) {
          const { error: splitError } = await supabase
            .from('purchase_order_payment_splits')
            .insert(splitsToInsert);
          if (splitError) throw splitError;
        }
      }

      return result;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Purchase order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['buy_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stock'] });
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
      if (!splitAllocation.isValid) {
        toast({ title: "Error", description: "Split payment allocation must match net payable amount", variant: "destructive" });
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
    setFormData(prev => ({ ...prev, [field]: value }));
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
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Bank
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
