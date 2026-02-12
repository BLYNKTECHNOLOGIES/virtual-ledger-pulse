import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle, Plus, Minus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { createSellerClient } from "@/utils/clientIdGenerator";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncRecord: any;
  onSuccess: () => void;
}

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

export function TerminalPurchaseApprovalDialog({ open, onOpenChange, syncRecord, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const od = syncRecord?.order_data || {};

  const [tdsOption, setTdsOption] = useState<'none' | '1%' | '20%'>('none');
  const [panNumber, setPanNumber] = useState(syncRecord?.pan_number || '');
  const [bankAccountId, setBankAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [linkedClientId, setLinkedClientId] = useState(syncRecord?.client_id || '');
  const [creatingClient, setCreatingClient] = useState(false);
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);

  // Auto-suggest TDS based on PAN availability
  useEffect(() => {
    if (syncRecord?.pan_number) {
      setTdsOption('1%');
      setPanNumber(syncRecord.pan_number);
    } else {
      setTdsOption('20%');
    }
    setLinkedClientId(syncRecord?.client_id || '');
  }, [syncRecord]);

  // Fetch bank accounts
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products (for USDT product ID)
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  // Find product matching the order asset (USDT, BTC, etc.)
  const matchedProduct = useMemo(() => {
    const asset = (od.asset || 'USDT').toUpperCase();
    return products.find((p: any) => 
      p.name?.toUpperCase() === asset || p.code?.toUpperCase() === asset
    );
  }, [products, od.asset]);

  // TDS calculation
  const totalAmount = parseFloat(od.total_price) || 0;
  const tdsRate = tdsOption === '1%' ? 1 : tdsOption === '20%' ? 20 : 0;
  const tdsAmount = totalAmount * (tdsRate / 100);
  const netPayable = totalAmount - tdsAmount;

  // Split payment allocation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) =>
      sum + (parseFloat(s.amount) || 0), 0);
    const remaining = netPayable - totalAllocated;
    const isValid = Math.abs(remaining) <= 0.01 && paymentSplits.every(s => s.bank_account_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, netPayable]);

  // Auto-fill first split amount when net payable changes
  useEffect(() => {
    if (isMultiplePayments && paymentSplits.length === 1 && netPayable > 0) {
      const currentAmount = parseFloat(paymentSplits[0].amount) || 0;
      if (currentAmount === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: netPayable.toFixed(2) }]);
      }
    }
  }, [isMultiplePayments, netPayable]);

  const addPaymentSplit = () => {
    setPaymentSplits(prev => [...prev, { bank_account_id: '', amount: '' }]);
  };

  const removePaymentSplit = (index: number) => {
    if (paymentSplits.length > 1) {
      setPaymentSplits(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updatePaymentSplit = (index: number, field: keyof PaymentSplit, value: string) => {
    setPaymentSplits(prev => prev.map((split, i) =>
      i === index ? { ...split, [field]: value } : split
    ));
  };

  // Create client mutation
  const createClientMutation = useMutation({
    mutationFn: async () => {
      const clientData = await createSellerClient(
        syncRecord.counterparty_name,
        'Terminal Counterparty'
      );
      return clientData;
    },
    onSuccess: (client: any) => {
      setLinkedClientId(client.id);
      toast({ title: "Client Created", description: `${syncRecord.counterparty_name} added as seller client` });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const userId = getCurrentUserId();

      // Validate
      if (tdsOption === '1%' && !panNumber.trim()) {
        throw new Error("PAN is required for 1% TDS");
      }

      if (isMultiplePayments) {
        if (!splitAllocation.isValid) {
          throw new Error(`Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)} (must be ₹0.00)`);
        }
        // Check for duplicate banks
        const bankIds = paymentSplits.map(s => s.bank_account_id);
        if (new Set(bankIds).size !== bankIds.length) {
          throw new Error("Each bank account can only be used once in split payments");
        }
      } else {
        if (!bankAccountId) {
          throw new Error("Please select a bank account");
        }
      }

      let result: any;
      let rpcError: any;

      if (isMultiplePayments) {
        const splitPaymentsJson = paymentSplits.map(s => ({
          bank_account_id: s.bank_account_id,
          amount: parseFloat(s.amount)
        }));

        const rpcParams = {
          p_order_number: od.order_number || `TRM-${Date.now()}`,
          p_supplier_name: syncRecord.counterparty_name,
          p_order_date: settlementDate,
          p_total_amount: totalAmount,
          p_product_id: matchedProduct?.id,
          p_quantity: parseFloat(od.amount) || 0,
          p_unit_price: parseFloat(od.unit_price) || 0,
          p_description: `Terminal P2P Purchase - ${od.order_number}${remarks ? ` | ${remarks}` : ''}`,
          p_credit_wallet_id: od.wallet_id || undefined,
          p_tds_option: tdsOption,
          p_pan_number: panNumber || undefined,
          p_fee_percentage: undefined,
          p_is_off_market: false,
          p_created_by: userId || undefined,
          p_payment_splits: splitPaymentsJson,
        };

        const { data, error } = await supabase.rpc('create_manual_purchase_with_split_payments', rpcParams);
        result = data;
        rpcError = error;
      } else {
        const rpcParams = {
          p_order_number: od.order_number || `TRM-${Date.now()}`,
          p_supplier_name: syncRecord.counterparty_name,
          p_order_date: settlementDate,
          p_total_amount: totalAmount,
          p_product_id: matchedProduct?.id || null,
          p_quantity: parseFloat(od.amount) || 0,
          p_unit_price: parseFloat(od.unit_price) || 0,
          p_bank_account_id: bankAccountId,
          p_description: `Terminal P2P Purchase - ${od.order_number}${remarks ? ` | ${remarks}` : ''}`,
          p_credit_wallet_id: od.wallet_id || null,
          p_tds_option: tdsOption,
          p_pan_number: panNumber || null,
          p_fee_percentage: null,
          p_is_off_market: false,
          p_created_by: userId || null,
          p_contact_number: null,
        };

        const { data, error } = await supabase.rpc('create_manual_purchase_complete_v2', rpcParams);
        result = data;
        rpcError = error;
      }

      if (rpcError) throw rpcError;
      if (result && !result.success) {
        throw new Error(result.error || 'Purchase creation failed');
      }

      // Update sync record
      const { error: updateErr } = await supabase
        .from('terminal_purchase_sync')
        .update({
          sync_status: 'approved',
          purchase_order_id: result?.purchase_order_id || null,
          client_id: linkedClientId || null,
          pan_number: panNumber || null,
          reviewed_by: userId || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', syncRecord.id);
      if (updateErr) throw updateErr;

      // Update purchase_orders source
      if (result?.purchase_order_id) {
        await supabase
          .from('purchase_orders')
          .update({
            source: 'terminal',
            terminal_sync_id: syncRecord.id,
          })
          .eq('id', result.purchase_order_id);
      }
    },
    onSuccess: () => {
      toast({ title: "Purchase Approved", description: "Terminal order has been approved and purchase created" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const orderDate = od.create_time ? format(new Date(od.create_time), 'dd MMM yyyy, HH:mm') : '—';

  const isSubmitDisabled = approveMutation.isPending || 
    (isMultiplePayments ? !splitAllocation.isValid : !bankAccountId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Approve Terminal Purchase</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only Terminal Data */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Lock className="h-3 w-3" />
                Terminal Data (Read-Only)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <LockedField label="Order Number" value={od.order_number} />
                <LockedField label="Order Date" value={orderDate} />
                <LockedField label="Asset" value={od.asset || 'USDT'} />
                <LockedField label="Quantity" value={`${Number(od.amount || 0).toLocaleString()} USDT`} />
                <LockedField label="Price Per Unit" value={`₹${Number(od.unit_price || 0).toLocaleString('en-IN')}`} />
                <LockedField label="Total Amount" value={`₹${totalAmount.toLocaleString('en-IN')}`} />
                <LockedField label="Commission/Fee" value={`${Number(od.commission || 0).toLocaleString()} USDT`} />
                <LockedField label="Wallet" value={od.wallet_name || '—'} />
                <LockedField label="Seller Name" value={syncRecord?.counterparty_name || '—'} />
                <LockedField label="Payment Method" value={od.pay_method || '—'} />
              </div>
            </CardContent>
          </Card>

          {/* Client Mapping */}
          <Card className="border-blue-100 bg-blue-50/30">
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs font-semibold">Client Mapping</Label>
              {linkedClientId ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{syncRecord?.counterparty_name}</span>
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Linked</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">No matching client found</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1"
                    onClick={() => createClientMutation.mutate()}
                    disabled={createClientMutation.isPending}
                  >
                    {createClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                    Create Client
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TDS & PAN */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">TDS Option</Label>
              <Select value={tdsOption} onValueChange={(v) => setTdsOption(v as any)}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="none">No TDS</SelectItem>
                  <SelectItem value="1%">1% TDS (PAN available)</SelectItem>
                  <SelectItem value="20%">20% TDS (No PAN)</SelectItem>
                </SelectContent>
              </Select>
              {tdsOption !== 'none' && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  TDS: ₹{tdsAmount.toLocaleString('en-IN')} | Net Payable: ₹{netPayable.toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">PAN Number</Label>
              <Input
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                className="mt-1 h-9 text-sm font-mono"
                maxLength={10}
              />
            </div>
          </div>

          {/* Bank Account with Split Payment Toggle */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Bank Account (Deduction)</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="split_payment_toggle"
                    checked={isMultiplePayments}
                    onCheckedChange={(checked) => {
                      setIsMultiplePayments(checked === true);
                      if (checked) {
                        setPaymentSplits([{
                          bank_account_id: bankAccountId || '',
                          amount: netPayable > 0 ? netPayable.toFixed(2) : ''
                        }]);
                      } else {
                        setPaymentSplits([{ bank_account_id: '', amount: '' }]);
                      }
                    }}
                  />
                  <Label htmlFor="split_payment_toggle" className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                    Split Payment
                  </Label>
                </div>
              </div>
              {!isMultiplePayments ? (
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50">
                    {bankAccounts.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.account_name} - ₹{Number(b.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 h-9 flex items-center">
                  Configure below
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Settlement Date</Label>
              <Input
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          {/* Split Payment Distribution */}
          {isMultiplePayments && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">Payment Distribution</Label>
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
                    <div className="text-muted-foreground text-[10px] mb-1">Net Payable</div>
                    <div className="font-semibold text-xs">₹{netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="text-center border-x">
                    <div className="text-muted-foreground text-[10px] mb-1">Allocated</div>
                    <div className="font-medium text-xs">₹{splitAllocation.totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px] mb-1">Remaining</div>
                    <div className={`font-semibold text-xs ${splitAllocation.isValid ? "text-green-600" : "text-destructive"}`}>
                      ₹{splitAllocation.remaining.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Payment Rows */}
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-1">
                    <div className="col-span-4">Amount (₹)</div>
                    <div className="col-span-7">Bank Account</div>
                    <div className="col-span-1"></div>
                  </div>

                  {paymentSplits.map((split, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={split.amount}
                          onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="col-span-7">
                        <Select
                          value={split.bank_account_id}
                          onValueChange={(value) => updatePaymentSplit(index, 'bank_account_id', value)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select bank" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border border-border shadow-lg z-50">
                            {bankAccounts.map((account: any) => (
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
                          <Minus className="h-3.5 w-3.5" />
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
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Another Bank
                </Button>
              </CardContent>
            </Card>
          )}

          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks..."
              className="mt-1 text-sm"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => approveMutation.mutate()}
            disabled={isSubmitDisabled}
          >
            {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve & Create Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}
