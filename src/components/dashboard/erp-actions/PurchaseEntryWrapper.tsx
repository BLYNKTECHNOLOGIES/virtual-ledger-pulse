import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { SupplierAutocomplete } from "@/components/purchase/SupplierAutocomplete";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { Info, Loader2, Plus, Minus, CheckCircle2, AlertCircle } from "lucide-react";

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

interface PurchaseEntryWrapperProps {
  item: ErpActionQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (refId?: string) => void;
}

export function PurchaseEntryWrapper({ item, open, onOpenChange, onSuccess }: PurchaseEntryWrapperProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);
  const [selectedClientBankDetails, setSelectedClientBankDetails] = useState<{
    pan_card_number?: string | null;
  } | null>(null);

  const [formData, setFormData] = useState({
    order_number: '',
    supplier_name: '',
    order_date: new Date().toISOString().split('T')[0],
    description: `ERP Action: Deposit reconciliation (${item.tx_id || item.movement_id})`,
    product_id: '',
    quantity: String(item.amount),
    price_per_unit: '',
    total_amount: '',
    contact_number: '',
    deduction_bank_account_id: '',
    credit_wallet_id: item.wallet_id || '',
    tds_option: 'none' as 'none' | '1%' | '20%',
    pan_number: '',
    fee_percentage: '',
    is_off_market: true, // Default off-market for ERP actions
  });

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bank_accounts').select('*').eq('status', 'ACTIVE');
      if (error) throw error;
      return data;
    },
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets-with-details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, wallet_type, chain_name, current_balance, fee_percentage, is_fee_enabled, is_active')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data;
    },
  });

  // Auto-match product
  useEffect(() => {
    if (products && !formData.product_id) {
      const match = products.find(
        (p) => p.code?.toUpperCase() === item.asset.toUpperCase() || p.name?.toUpperCase() === item.asset.toUpperCase()
      );
      if (match) setFormData((prev) => ({ ...prev, product_id: match.id }));
    }
  }, [products, item.asset]);

  const selectedWallet = useMemo(() => wallets?.find(w => w.id === formData.credit_wallet_id), [wallets, formData.credit_wallet_id]);

  // Auto-fill fee from wallet
  useEffect(() => {
    if (selectedWallet && !formData.fee_percentage) {
      if (selectedWallet.is_fee_enabled && selectedWallet.fee_percentage) {
        setFormData(prev => ({ ...prev, fee_percentage: selectedWallet.fee_percentage.toString() }));
      }
    }
  }, [selectedWallet]);

  // TDS calculation
  const tdsCalculation = useMemo(() => {
    const totalAmount = parseFloat(formData.total_amount) || 0;
    let tdsRate = 0;
    if (formData.tds_option === '1%') tdsRate = 1;
    else if (formData.tds_option === '20%') tdsRate = 20;
    const tdsAmount = totalAmount * (tdsRate / 100);
    const netPayable = totalAmount - tdsAmount;
    return { tdsRate, tdsAmount, netPayable };
  }, [formData.total_amount, formData.tds_option]);

  // Fee calculation
  const feeCalculation = useMemo(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const feePercentage = parseFloat(formData.fee_percentage) || 0;
    if (formData.is_off_market || feePercentage <= 0) return { feeAmount: 0, netCredit: quantity };
    const feeAmount = quantity * (feePercentage / 100);
    return { feeAmount, netCredit: quantity - feeAmount };
  }, [formData.quantity, formData.fee_percentage, formData.is_off_market]);

  // Split allocation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const remaining = tdsCalculation.netPayable - totalAllocated;
    const isValid = Math.abs(remaining) <= 0.01 && paymentSplits.every(s => s.bank_account_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, tdsCalculation.netPayable]);

  const addPaymentSplit = () => setPaymentSplits(prev => [...prev, { bank_account_id: '', amount: '' }]);
  const removePaymentSplit = (index: number) => {
    if (paymentSplits.length > 1) setPaymentSplits(prev => prev.filter((_, i) => i !== index));
  };
  const updatePaymentSplit = (index: number, field: keyof PaymentSplit, value: string) => {
    setPaymentSplits(prev => prev.map((split, i) => i === index ? { ...split, [field]: value } : split));
  };

  // Auto-fill first split
  useEffect(() => {
    if (isMultiplePayments && paymentSplits.length === 1 && tdsCalculation.netPayable > 0) {
      if ((parseFloat(paymentSplits[0].amount) || 0) === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: tdsCalculation.netPayable.toFixed(2) }]);
      }
    }
  }, [isMultiplePayments, tdsCalculation.netPayable]);

  // Auto-fill PAN
  useEffect(() => {
    if (formData.tds_option === '1%' && selectedClientId && selectedClientBankDetails?.pan_card_number && !formData.pan_number) {
      setFormData(prev => ({ ...prev, pan_number: selectedClientBankDetails.pan_card_number || '' }));
    }
  }, [formData.tds_option, selectedClientId, selectedClientBankDetails]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const newValue = parseFloat(value as string) || 0;
        const existingQty = parseFloat(prev.quantity) || 0;
        const existingPrice = parseFloat(prev.price_per_unit) || 0;
        const existingTotal = parseFloat(prev.total_amount) || 0;

        if (field === 'quantity') {
          if (existingPrice > 0 && newValue > 0) updated.total_amount = (newValue * existingPrice).toFixed(2);
        } else if (field === 'price_per_unit') {
          if (existingTotal > 0 && newValue > 0) updated.quantity = (existingTotal / newValue).toFixed(4);
          else if (existingQty > 0 && newValue > 0) updated.total_amount = (existingQty * newValue).toFixed(2);
        } else if (field === 'total_amount') {
          if (existingPrice > 0 && newValue > 0) updated.quantity = (newValue / existingPrice).toFixed(4);
        }
      }
      if (field === 'credit_wallet_id' && value) {
        const wallet = wallets?.find(w => w.id === value);
        if (wallet?.is_fee_enabled && wallet?.fee_percentage) updated.fee_percentage = wallet.fee_percentage.toString();
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const missingFields = [];
      if (!formData.supplier_name) missingFields.push('Supplier');
      if (!formData.quantity) missingFields.push('Quantity');
      if (!formData.price_per_unit) missingFields.push('Price');
      if (!formData.product_id) missingFields.push('Product');
      if (!formData.credit_wallet_id) missingFields.push('Wallet');

      if (isMultiplePayments) {
        if (!splitAllocation.isValid) {
          toast({ title: "Error", description: `Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)}`, variant: "destructive" });
          setLoading(false);
          return;
        }
      } else {
        if (!formData.deduction_bank_account_id) missingFields.push('Bank Account');
      }

      if (missingFields.length > 0) {
        toast({ title: "Error", description: `Missing: ${missingFields.join(', ')}`, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (formData.tds_option === '1%' && !formData.pan_number?.trim()) {
        toast({ title: "Error", description: "PAN required for 1% TDS", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data: orderNumber, error: orderNumErr } = await supabase.rpc('generate_off_market_purchase_order_number');
      if (orderNumErr || !orderNumber) throw new Error('Failed to generate order number');

      const totalAmount = parseFloat(formData.total_amount) || 0;
      const currentUserId = getCurrentUserId();

      let result: Record<string, unknown>;
      let functionError: Error | null = null;

      if (isMultiplePayments && paymentSplits.length > 0) {
        const splitPaymentsJson = paymentSplits.map(s => ({ bank_account_id: s.bank_account_id, amount: parseFloat(s.amount) }));
        const { data, error } = await supabase.rpc('create_manual_purchase_with_split_payments', {
          p_order_number: orderNumber,
          p_supplier_name: formData.supplier_name,
          p_order_date: formData.order_date,
          p_total_amount: totalAmount,
          p_product_id: formData.product_id,
          p_quantity: parseFloat(formData.quantity),
          p_unit_price: parseFloat(formData.price_per_unit),
          p_description: formData.description || '',
          p_contact_number: formData.contact_number || undefined,
          p_credit_wallet_id: formData.credit_wallet_id || undefined,
          p_tds_option: formData.tds_option,
          p_pan_number: formData.pan_number || undefined,
          p_fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : undefined,
          p_is_off_market: formData.is_off_market,
          p_created_by: currentUserId || undefined,
          p_payment_splits: splitPaymentsJson,
        });
        result = data as Record<string, unknown>;
        functionError = error;
      } else {
        const { data, error } = await supabase.rpc('create_manual_purchase_complete_v2', {
          p_order_number: orderNumber,
          p_supplier_name: formData.supplier_name,
          p_order_date: formData.order_date,
          p_total_amount: totalAmount,
          p_product_id: formData.product_id,
          p_quantity: parseFloat(formData.quantity),
          p_unit_price: parseFloat(formData.price_per_unit),
          p_bank_account_id: formData.deduction_bank_account_id,
          p_description: formData.description || '',
          p_contact_number: formData.contact_number || undefined,
          p_credit_wallet_id: formData.credit_wallet_id || undefined,
          p_tds_option: formData.tds_option,
          p_pan_number: formData.pan_number || undefined,
          p_fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : undefined,
          p_is_off_market: formData.is_off_market,
          p_created_by: currentUserId || undefined,
        });
        result = data as Record<string, unknown>;
        functionError = error;
      }

      if (functionError) throw functionError;
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        throw new Error(String(result.error || 'Unknown error'));
      }

      toast({ title: "Purchase Entry Created", description: `Order ${orderNumber} created.` });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank_accounts_with_balance"] });
      onSuccess(orderNumber || undefined);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase Entry — {item.amount} {item.asset}</DialogTitle>
          <DialogDescription>Record this deposit as an asset purchase</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Order Number + Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Order Number</Label>
              <Input value="Auto-generated" disabled className="bg-muted" />
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={(e) => handleInputChange('contact_number', e.target.value)}
                placeholder="Enter contact number"
              />
            </div>
          </div>

          {/* Row 2: Seller + Product */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <SupplierAutocomplete
                value={formData.supplier_name}
                onChange={(value) => handleInputChange('supplier_name', value)}
                onContactChange={(contact) => handleInputChange('contact_number', contact)}
                onClientSelect={(clientId, clientName, bankDetails) => {
                  setSelectedClientId(clientId);
                  setSelectedClientBankDetails(bankDetails || null);
                  handleInputChange('supplier_name', clientName);
                  if (bankDetails?.pan_card_number && formData.tds_option === '1%') {
                    handleInputChange('pan_number', bankDetails.pan_card_number);
                  }
                }}
                onNewClient={(isNew) => {
                  setIsNewClient(isNew);
                  if (isNew) setSelectedClientBankDetails(null);
                }}
                selectedClientId={selectedClientId}
              />
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={formData.product_id} onValueChange={(value) => handleInputChange('product_id', value)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent className="bg-popover z-[60] border border-border shadow-lg">
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - {product.code} (Stock: {product.current_stock_quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Amount, Price, Quantity */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Total Amount (₹)</Label>
              <Input type="number" step="0.01" value={formData.total_amount} onChange={(e) => handleInputChange('total_amount', e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Price per Unit (₹) *</Label>
              <Input type="number" step="0.01" value={formData.price_per_unit} onChange={(e) => handleInputChange('price_per_unit', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" step="0.0001" value={formData.quantity} onChange={(e) => handleInputChange('quantity', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {/* Row 4: Wallet + Bank Account */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between h-6">
                <Label className="whitespace-nowrap">Wallet *</Label>
                <div className="flex items-center gap-1.5 opacity-0 select-none pointer-events-none">
                  <Checkbox checked={false} />
                  <span className="text-xs whitespace-nowrap">Split Payment</span>
                </div>
              </div>
              <Select value={formData.credit_wallet_id} onValueChange={(value) => handleInputChange('credit_wallet_id', value)}>
                <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                  {wallets?.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name}{wallet.chain_name ? ` — ${wallet.chain_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between h-6">
                <Label className="whitespace-nowrap">Bank Account *</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="erp_multiple_payments"
                    checked={isMultiplePayments}
                    onCheckedChange={(checked) => {
                      setIsMultiplePayments(checked === true);
                      if (checked) {
                        if (tdsCalculation.netPayable > 0) {
                          setPaymentSplits([{ bank_account_id: formData.deduction_bank_account_id || '', amount: tdsCalculation.netPayable.toFixed(2) }]);
                        }
                      } else {
                        setPaymentSplits([{ bank_account_id: '', amount: '' }]);
                      }
                    }}
                  />
                  <Label htmlFor="erp_multiple_payments" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">Split Payment</Label>
                </div>
              </div>

              {!isMultiplePayments ? (
                <Select value={formData.deduction_bank_account_id} onValueChange={(value) => handleInputChange('deduction_bank_account_id', value)}>
                  <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                  <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name} - ₹{Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 h-10 flex items-center">
                  Configure payment distribution below
                </div>
              )}
            </div>
          </div>

          {/* Split Payments */}
          {isMultiplePayments && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">Payment Distribution</Label>
                    {splitAllocation.isValid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm bg-background/80 rounded-lg p-3 border">
                  <div className="text-center">
                    <div className="text-muted-foreground text-xs mb-1">Net Payable</div>
                    <div className="font-semibold">₹{tdsCalculation.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
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

                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-3 text-xs text-muted-foreground px-1">
                    <div className="col-span-4">Amount (₹)</div>
                    <div className="col-span-7">Bank Account</div>
                    <div className="col-span-1"></div>
                  </div>
                  {paymentSplits.map((split, index) => (
                    <div key={index} className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-4">
                        <Input type="number" step="0.01" min="0" value={split.amount} onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)} placeholder="0.00" />
                      </div>
                      <div className="col-span-7">
                        <Select value={split.bank_account_id} onValueChange={(value) => updatePaymentSplit(index, 'bank_account_id', value)}>
                          <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
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
                        <Button type="button" variant="ghost" size="icon" onClick={() => removePaymentSplit(index)} disabled={paymentSplits.length === 1} className="h-8 w-8">
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addPaymentSplit} className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Add Another Bank
                </Button>
              </CardContent>
            </Card>
          )}

          {/* TDS */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Label className="font-medium">TDS Deduction</Label>
                <Badge variant="outline" className="text-xs">Tax</Badge>
              </div>
              <Select value={formData.tds_option} onValueChange={(value) => handleInputChange('tds_option', value)}>
                <SelectTrigger><SelectValue placeholder="Select TDS option" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="none">No TDS</SelectItem>
                  <SelectItem value="1%">1% TDS (Requires PAN)</SelectItem>
                  <SelectItem value="20%">20% TDS (No PAN Required)</SelectItem>
                </SelectContent>
              </Select>
              {formData.tds_option === '1%' && (
                <div>
                  <Label>PAN Number *</Label>
                  <Input value={formData.pan_number} onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} className="uppercase" />
                </div>
              )}
              {tdsCalculation.tdsRate > 0 && parseFloat(formData.total_amount) > 0 && (
                <div className="text-sm bg-background p-2 rounded border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TDS Amount ({tdsCalculation.tdsRate}%):</span>
                    <span className="font-medium text-amber-600">₹{tdsCalculation.tdsAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">Net Payable:</span>
                    <span className="font-semibold text-green-600">₹{tdsCalculation.netPayable.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Platform Fee */}
          <Card className="border-muted">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Off Market</Label>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
                <Switch checked={formData.is_off_market} onCheckedChange={(checked) => handleInputChange('is_off_market', checked)} />
              </div>
              {!formData.is_off_market && (
                <>
                  <div>
                    <Label>Platform Fee (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={formData.fee_percentage} onChange={(e) => handleInputChange('fee_percentage', e.target.value)} placeholder="Enter fee percentage" />
                  </div>
                  {feeCalculation.feeAmount > 0 && parseFloat(formData.quantity) > 0 && (
                    <div className="text-sm bg-muted/50 p-2 rounded border">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee Amount:</span>
                        <span className="font-medium text-orange-600">{feeCalculation.feeAmount.toFixed(4)} USDT</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">Net Credit to Wallet:</span>
                        <span className="font-semibold text-green-600">{feeCalculation.netCredit.toFixed(4)} USDT</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {formData.is_off_market && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" /> Off Market: No platform fees will be applied
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Date */}
          <div>
            <Label>Order Date</Label>
            <Input type="date" value={formData.order_date} onChange={(e) => handleInputChange('order_date', e.target.value)} />
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="Enter purchase description" rows={2} />
          </div>

          {/* Summary */}
          {parseFloat(formData.total_amount) > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="text-sm font-medium mb-2">Transaction Summary</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Amount:</span>
                    <span>₹{parseFloat(formData.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {tdsCalculation.tdsRate > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>TDS ({tdsCalculation.tdsRate}%):</span>
                      <span>-₹{tdsCalculation.tdsAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {isMultiplePayments && paymentSplits.some(s => parseFloat(s.amount) > 0) ? (
                    <>
                      <div className="border-t pt-1 mt-1"><span className="text-muted-foreground">Bank Deductions:</span></div>
                      {paymentSplits.filter(s => parseFloat(s.amount) > 0).map((split, index) => {
                        const bank = bankAccounts?.find(b => b.id === split.bank_account_id);
                        return (
                          <div key={index} className="flex justify-between pl-4 text-destructive">
                            <span>• {bank?.account_name || 'Unknown'}:</span>
                            <span>-₹{parseFloat(split.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                        <span>Total Bank Deduction:</span>
                        <span className="text-destructive">-₹{splitAllocation.totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                      <span>Bank Deduction:</span>
                      <span className="text-destructive">-₹{tdsCalculation.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading} className="min-w-[160px]">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : "Create Purchase Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
