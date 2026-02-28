import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Package, Clock, Coins, Plus, Minus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { getCurrentUserId } from '@/lib/system-action-logger';
import { fetchCoinMarketRate } from '@/hooks/useCoinMarketRate';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';
import { useActiveBankAccounts } from '@/hooks/useActiveBankAccounts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: any;
}

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

export function SmallBuysApprovalDialog({ open, onOpenChange, record }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [coinUsdtRate, setCoinUsdtRate] = useState<number | null>(null);
  const [tdsOption, setTdsOption] = useState<'none' | '1%' | '20%'>('none');
  const [panNumber, setPanNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);
  const [gatewayFeeEnabled, setGatewayFeeEnabled] = useState(false);
  const [gatewayFeeAmount, setGatewayFeeAmount] = useState('');
  const [gatewayFeeBankId, setGatewayFeeBankId] = useState('');

  const assetCode = record?.asset_code || 'USDT';
  const isNonUsdt = assetCode !== 'USDT';

  // Fetch live CoinUSDT rate for non-USDT assets
  useEffect(() => {
    if (open && isNonUsdt) {
      fetchCoinMarketRate(assetCode).then(rate => setCoinUsdtRate(rate));
    } else if (!isNonUsdt) {
      setCoinUsdtRate(1.0);
    }
  }, [open, assetCode, isNonUsdt]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTdsOption('none');
      setPanNumber('');
      setBankAccountId('');
      setSettlementDate(new Date().toISOString().split('T')[0]);
      setShowReject(false);
      setRejectionReason('');
      setIsMultiplePayments(false);
      setPaymentSplits([{ bank_account_id: '', amount: '' }]);
      setGatewayFeeEnabled(false);
      setGatewayFeeAmount('');
      setGatewayFeeBankId('');
    }
  }, [open]);

  const { data: bankAccounts = [] } = useActiveBankAccounts(open);

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const matchedProduct = useMemo(() => {
    return products.find((p: any) =>
      p.name?.toUpperCase() === assetCode || p.code?.toUpperCase() === assetCode
    );
  }, [products, assetCode]);

  // TDS calculation
  const totalAmount = Number(record?.total_amount || 0);
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

  // Auto-fill first split amount
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

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error('No record selected');

      if (tdsOption === '1%' && !panNumber.trim()) {
        throw new Error('PAN is required for 1% TDS');
      }

      if (isMultiplePayments) {
        if (!splitAllocation.isValid) {
          throw new Error(`Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)}`);
        }
        const bankIds = paymentSplits.map(s => s.bank_account_id);
        if (new Set(bankIds).size !== bankIds.length) {
          throw new Error('Each bank account can only be used once in split payments');
        }
      } else {
        if (!bankAccountId) {
          throw new Error('Please select a bank account');
        }
      }

      const userId = getCurrentUserId();

      // Generate SB-prefixed order number
      const { count } = await supabase
        .from('small_buys_sync' as any)
        .select('id', { count: 'exact', head: true })
        .eq('sync_status', 'approved');
      const seqNum = (count || 0) + 1;
      const orderNumber = `SB${String(seqNum).padStart(5, '0')}`;

      const totalQty = Number(record.total_quantity || 0);
      const totalFee = Number(record.total_fee || 0);
      const netQty = totalQty - totalFee;

      let result: any;
      let rpcError: any;

      if (isMultiplePayments) {
        const splitPaymentsJson = paymentSplits.map(s => ({
          bank_account_id: s.bank_account_id,
          amount: parseFloat(s.amount),
        }));

        const { data, error } = await supabase.rpc('create_manual_purchase_with_split_payments', {
          p_order_number: orderNumber,
          p_supplier_name: 'Small Buys',
          p_order_date: settlementDate,
          p_total_amount: totalAmount,
          p_product_id: matchedProduct?.id || null,
          p_quantity: netQty,
          p_unit_price: Number(record.avg_price || 0),
          p_description: `Clubbed ${record.order_count} small ${assetCode} buy orders`,
          p_credit_wallet_id: record.wallet_id || undefined,
          p_tds_option: tdsOption,
          p_pan_number: panNumber || undefined,
          p_fee_percentage: undefined,
          p_is_off_market: false,
          p_created_by: userId || undefined,
          p_payment_splits: splitPaymentsJson,
        });
        result = data;
        rpcError = error;
      } else {
        const { data, error } = await supabase.rpc('create_manual_purchase_complete_v2', {
          p_order_number: orderNumber,
          p_supplier_name: 'Small Buys',
          p_order_date: settlementDate,
          p_total_amount: totalAmount,
          p_product_id: matchedProduct?.id || null,
          p_quantity: netQty,
          p_unit_price: Number(record.avg_price || 0),
          p_bank_account_id: bankAccountId,
          p_description: `Clubbed ${record.order_count} small ${assetCode} buy orders`,
          p_credit_wallet_id: record.wallet_id || null,
          p_tds_option: tdsOption,
          p_pan_number: panNumber || null,
          p_fee_percentage: null,
          p_is_off_market: false,
          p_created_by: userId || null,
          p_contact_number: null,
        });
        result = data;
        rpcError = error;
      }

      if (rpcError) throw rpcError;
      if (result && !result.success) {
        throw new Error(result.error || 'Purchase creation failed');
      }

      // Update sync record
      await supabase
        .from('small_buys_sync' as any)
        .update({
          sync_status: 'approved',
          purchase_order_id: result?.purchase_order_id || null,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      // Update purchase_orders source & market rate
      if (result?.purchase_order_id) {
        const marketRate = await fetchCoinMarketRate(assetCode);
        const rawFee = totalFee;
        const feeUsdt = assetCode === 'USDT' ? rawFee : rawFee * (marketRate > 0 ? marketRate : 0);

        await supabase
          .from('purchase_orders')
          .update({
            source: 'terminal_small_buys',
            market_rate_usdt: marketRate > 0 ? marketRate : null,
            fee_amount: feeUsdt > 0 ? feeUsdt : null,
          })
          .eq('id', result.purchase_order_id);
      }

      // Record gateway fee as a separate expense transaction
      if (gatewayFeeEnabled && parseFloat(gatewayFeeAmount) > 0 && gatewayFeeBankId) {
        const feeAmt = parseFloat(gatewayFeeAmount);
        await supabase.from('bank_transactions').insert({
          bank_account_id: gatewayFeeBankId,
          transaction_type: 'Expense',
          amount: feeAmt,
          category: 'Payout Gateway Fee',
          description: `Payout gateway fee for Small Buys ${record.asset_code} – ${record.order_count} orders (${result?.purchase_order_id || ''})`,
          transaction_date: settlementDate,
          created_by: userId,
        });
      }

      return result;
    },
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Small buys purchase entry created in ERP' });
      queryClient.invalidateQueries({ queryKey: ['small_buys_sync'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['crypto_wallets'] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Approval failed', variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const userId = getCurrentUserId();
      await supabase
        .from('small_buys_sync' as any)
        .update({
          sync_status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || 'Rejected by operator',
        })
        .eq('id', record.id);
    },
    onSuccess: () => {
      toast({ title: 'Rejected' });
      queryClient.invalidateQueries({ queryKey: ['small_buys_sync'] });
      onOpenChange(false);
    },
  });

  if (!record) return null;

  const isSubmitDisabled = approveMutation.isPending ||
    (isMultiplePayments ? !splitAllocation.isValid : !bankAccountId) ||
    (gatewayFeeEnabled && (!gatewayFeeAmount || parseFloat(gatewayFeeAmount) <= 0 || !gatewayFeeBankId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Small Buys Bulk Approval
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Asset</span>
              <p className="font-semibold text-lg">{record.asset_code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Orders Clubbed</span>
              <p className="font-semibold text-lg">{record.order_count}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Quantity</span>
              <p className="font-medium">{Number(record.total_quantity).toFixed(4)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Price</span>
              <p className="font-medium">₹{Number(record.avg_price).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Amount</span>
              <p className="font-semibold text-primary">₹{Number(record.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Fee</span>
              <p className="font-medium">{Number(record.total_fee).toFixed(4)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Wallet</span>
              <p className="font-medium">{record.wallet_name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Time Window</span>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {record.time_window_start && format(new Date(record.time_window_start), 'HH:mm')} –{' '}
                {record.time_window_end && format(new Date(record.time_window_end), 'HH:mm')}
              </div>
            </div>
          </div>

          {/* USDT Equivalent */}
          {isNonUsdt && coinUsdtRate && coinUsdtRate > 0 && (() => {
            const qty = Number(record.total_quantity || 0);
            const totalAmt = Number(record.total_amount || 0);
            const usdtEquivQty = qty * coinUsdtRate;
            const equivUsdtRate = usdtEquivQty > 0 ? totalAmt / usdtEquivQty : 0;
            return (
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5" />
                  USDT Equivalent (Live)
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-blue-700 dark:text-blue-500">{assetCode}/USDT</span>
                    <p className="font-medium text-blue-900 dark:text-blue-300">{formatSmartDecimal(coinUsdtRate, 6)}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 dark:text-blue-500">USDT Qty</span>
                    <p className="font-medium text-blue-900 dark:text-blue-300">{formatSmartDecimal(usdtEquivQty, 4)}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 dark:text-blue-500">USDT Rate</span>
                    <p className="font-medium text-blue-900 dark:text-blue-300">₹{formatSmartDecimal(equivUsdtRate, 2)}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          <Separator />

          {/* TDS Option */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>TDS Option</Label>
              <Select value={tdsOption} onValueChange={(v) => setTdsOption(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No TDS</SelectItem>
                  <SelectItem value="1%">1% TDS</SelectItem>
                  <SelectItem value="20%">20% TDS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tdsOption !== 'none' && (
              <div>
                <Label>PAN Number {tdsOption === '1%' && '*'}</Label>
                <Input
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </div>
            )}
          </div>

          {tdsOption !== 'none' && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">TDS: ₹{tdsAmount.toLocaleString()}</span>
              <span className="font-semibold">Net Payable: ₹{netPayable.toLocaleString()}</span>
            </div>
          )}

          {/* Settlement Date */}
          <div>
            <Label>Settlement Date</Label>
            <Input
              type="date"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
            />
          </div>

          <Separator />

          {/* Payout Gateway Fee */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Payout Gateway Fee</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gateway-fee"
                  checked={gatewayFeeEnabled}
                  onCheckedChange={(checked) => {
                    setGatewayFeeEnabled(!!checked);
                    if (!checked) {
                      setGatewayFeeAmount('');
                      setGatewayFeeBankId('');
                    }
                  }}
                />
                <label htmlFor="gateway-fee" className="text-xs text-muted-foreground cursor-pointer">
                  Apply Fee
                </label>
              </div>
            </div>
            {gatewayFeeEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fee Amount (₹)</Label>
                  <Input
                    type="number"
                    value={gatewayFeeAmount}
                    onChange={(e) => setGatewayFeeAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Fee Deducted From</Label>
                  <Select value={gatewayFeeBankId} onValueChange={setGatewayFeeBankId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((ba) => (
                        <SelectItem key={ba.id} value={ba.id} className="text-xs">
                          {ba.account_name} ({ba.bank_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {gatewayFeeEnabled && (
              <p className="text-xs text-muted-foreground">
                This fee will be recorded as a separate expense, not as a purchasing cost.
              </p>
            )}
          </div>

          <Separator />

          {/* Bank Account / Split Payment */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Payment Method</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="split-payment"
                checked={isMultiplePayments}
                onCheckedChange={(checked) => {
                  setIsMultiplePayments(!!checked);
                  if (!checked) {
                    setPaymentSplits([{ bank_account_id: '', amount: '' }]);
                  }
                }}
              />
              <label htmlFor="split-payment" className="text-xs text-muted-foreground cursor-pointer">
                Split Payment
              </label>
            </div>
          </div>

          {!isMultiplePayments ? (
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((ba) => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.account_name} ({ba.bank_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-3">
                {/* Status bar */}
                <div className="flex items-center justify-between text-xs">
                  <span>Net Payable: <strong>₹{netPayable.toLocaleString()}</strong></span>
                  <span>Allocated: <strong>₹{splitAllocation.totalAllocated.toLocaleString()}</strong></span>
                  <Badge variant={Math.abs(splitAllocation.remaining) <= 0.01 ? 'default' : 'destructive'} className="text-xs">
                    Remaining: ₹{splitAllocation.remaining.toFixed(2)}
                  </Badge>
                </div>

                {paymentSplits.map((split, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex-1">
                      {index === 0 && <Label className="text-xs">Bank Account</Label>}
                      <Select
                        value={split.bank_account_id}
                        onValueChange={(v) => updatePaymentSplit(index, 'bank_account_id', v)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map((ba) => (
                            <SelectItem key={ba.id} value={ba.id} className="text-xs">
                              {ba.account_name} ({ba.bank_name})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-32">
                      {index === 0 && <Label className="text-xs">Amount (₹)</Label>}
                      <Input
                        type="number"
                        className="h-9 text-xs"
                        value={split.amount}
                        onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removePaymentSplit(index)}
                      disabled={paymentSplits.length <= 1}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addPaymentSplit} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Split
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Reject section */}
          {showReject && (
            <div>
              <Label>Rejection Reason</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm"
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection..."
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!showReject ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowReject(true)}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                disabled={isSubmitDisabled}
                onClick={() => approveMutation.mutate()}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                Confirm Reject
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
