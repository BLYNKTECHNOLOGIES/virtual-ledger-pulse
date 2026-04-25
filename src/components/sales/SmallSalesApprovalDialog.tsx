import { useState, useEffect, useMemo } from 'react';
import { parseApprovalError } from '@/utils/approvalErrorParser';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, Package, Clock, Coins, Plus, Minus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { requireCurrentUserId } from '@/lib/system-action-logger';
import { fetchAndLockMarketRate, persistBatchValuation } from '@/lib/effectiveUsdtEngine';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';
import { isAdjustmentBank } from '@/lib/adjustment-accounts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: any;
}

interface PaymentSplit {
  payment_method_id: string;
  amount: string;
}

function isDuplicateConstraintError(error: any): boolean {
  const message = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return message.includes('23505') || message.includes('duplicate key') || message.includes('unique constraint');
}

export function SmallSalesApprovalDialog({ open, onOpenChange, record }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [coinUsdtRate, setCoinUsdtRate] = useState<number | null>(null);

  // Split payment state — mirrors TerminalSalesApprovalDialog pattern.
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { payment_method_id: '', amount: '' },
  ]);

  const assetCode = record?.asset_code || 'USDT';
  const isNonUsdt = assetCode !== 'USDT';
  const totalAmount = Number(record?.total_amount || 0);

  // Reset local state whenever a new record is opened so we never carry over a
  // stale split configuration into a different batch.
  useEffect(() => {
    if (open) {
      setPaymentMethodId('');
      setRejectionReason('');
      setShowReject(false);
      setIsMultiplePayments(false);
      setPaymentSplits([{ payment_method_id: '', amount: '' }]);
    }
  }, [open, record?.id]);

  // Fetch live CoinUSDT rate for non-USDT assets
  useEffect(() => {
    if (open && isNonUsdt) {
      fetchAndLockMarketRate(assetCode, { entryType: 'small_sales_preview' })
        .then(locked => setCoinUsdtRate(locked.price))
        .catch(() => setCoinUsdtRate(null));
    }
  }, [open, assetCode, isNonUsdt]);

  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods_bams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name)')
        .eq('is_active', true)
        .order('nickname');
      if (error) throw error;
      return (data || []).filter((method: any) => !isAdjustmentBank(method.bank_accounts?.account_name));
    },
    enabled: open,
  });

  // Auto-fill the first split's amount with the full order total whenever the
  // operator first toggles split mode on.
  useEffect(() => {
    if (isMultiplePayments && paymentSplits.length === 1 && totalAmount > 0) {
      const currentAmount = parseFloat(paymentSplits[0].amount) || 0;
      if (currentAmount === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: totalAmount.toFixed(2) }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplePayments, totalAmount]);

  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce(
      (sum, s) => sum + (parseFloat(s.amount) || 0),
      0,
    );
    const remaining = totalAmount - totalAllocated;
    const isValid =
      Math.abs(remaining) <= 0.01 &&
      paymentSplits.every(
        s => s.payment_method_id && parseFloat(s.amount) > 0,
      );
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, totalAmount]);

  const addPaymentSplit = () =>
    setPaymentSplits(prev => [...prev, { payment_method_id: '', amount: '' }]);

  const removePaymentSplit = (index: number) => {
    if (paymentSplits.length > 1) {
      setPaymentSplits(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updatePaymentSplit = (
    index: number,
    field: keyof PaymentSplit,
    value: string,
  ) => {
    setPaymentSplits(prev =>
      prev.map((split, i) => (i === index ? { ...split, [field]: value } : split)),
    );
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error('Missing batch record');

      // ── Validation ────────────────────────────────────────────────
      if (isMultiplePayments) {
        if (!splitAllocation.isValid) {
          throw new Error(
            `Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(
              2,
            )} (must be ₹0.00)`,
          );
        }
        const methodIds = paymentSplits.map(s => s.payment_method_id);
        if (new Set(methodIds).size !== methodIds.length) {
          throw new Error('Duplicate payment methods in split payment');
        }
      } else if (!paymentMethodId) {
        throw new Error('Select a payment method');
      }

      let createdSalesOrderId: string | null = null;
      let claimed = false;

      try {
        // ── Idempotency guard: atomically claim this batch so a second click cannot create a duplicate ──
        const { data: claimRows, error: claimErr } = await supabase
          .from('small_sales_sync')
          .update({ sync_status: 'processing' })
          .eq('id', record.id)
          .eq('sync_status', 'pending_approval')
          .select('id');
        if (claimErr) throw claimErr;
        if (!claimRows || claimRows.length === 0) {
          throw new Error('This batch is already being processed or has been approved. Please refresh.');
        }
        claimed = true;

        const locked = await fetchAndLockMarketRate(assetCode, { entryType: 'batch_approval' });
        const marketRate = locked.price;

        const userId = await requireCurrentUserId();
        const approvalTimestamp = new Date().toISOString();

        const { data: productRow } = await supabase
          .from('products')
          .select('id')
          .eq('code', assetCode)
          .single();
        if (!productRow) throw new Error(`Product not found for asset: ${assetCode}`);

        // Resolve "single method" details only when not splitting
        const selectedMethod = isMultiplePayments
          ? null
          : paymentMethods?.find(m => m.id === paymentMethodId);
        if (!isMultiplePayments && !selectedMethod) {
          throw new Error('Selected payment method was not found');
        }
        const isGateway = isMultiplePayments
          ? false
          : Boolean(selectedMethod?.payment_gateway);

        // Effective-USDT valuation
        const ssEffRate = marketRate && marketRate > 0 ? marketRate : 1;
        const ssQty = Number(record.total_quantity || 0);
        const ssTotalAmt = Number(record.total_amount || 0);
        const ssEffUsdtQty = ssQty * ssEffRate;
        const ssEffUsdtRate = ssEffUsdtQty > 0 ? ssTotalAmt / ssEffUsdtQty : null;

        // For non-split, resolve the bank account up front (must exist)
        let singleResolvedBankId: string | null = null;
        if (!isMultiplePayments) {
          singleResolvedBankId = selectedMethod!.bank_account_id;
          if (!singleResolvedBankId) {
            throw new Error(
              `No bank account is linked to ${selectedMethod!.nickname || selectedMethod!.type || 'the selected payment method'}`,
            );
          }
        } else {
          // For split, every chosen method must resolve to a bank account
          for (const s of paymentSplits) {
            const pm = paymentMethods?.find(m => m.id === s.payment_method_id);
            if (!pm?.bank_account_id) {
              throw new Error(
                `No bank account is linked to ${pm?.nickname || pm?.type || 'one of the selected payment methods'}`,
              );
            }
          }
        }

        const orderDateSource = record.time_window_end || record.time_window_start || approvalTimestamp;
        const orderDate = new Date(orderDateSource).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        // ── Insert sales_orders header ──────────────────────────────
        // Retry order-number collisions so a stale sequence can never block approval.
        let orderNumber = '';
        let salesOrder: { id: string } | null = null;
        for (let attempt = 0; attempt < 5 && !salesOrder; attempt++) {
          const { data: nextOrderNum, error: orderNumErr } = await supabase.rpc('next_small_sales_order_number');
          if (orderNumErr || !nextOrderNum) throw orderNumErr || new Error('Failed to generate order number');
          orderNumber = nextOrderNum as string;

          const { data, error: soErr } = await supabase
            .from('sales_orders')
            .insert({
              order_number: orderNumber,
              client_name: 'Small Sales',
              client_phone: null,
              client_state: null,
              order_date: orderDate,
              total_amount: record.total_amount,
              quantity: record.total_quantity,
              price_per_unit: record.avg_price,
              product_id: productRow.id,
              sales_payment_method_id: isMultiplePayments ? null : paymentMethodId,
              is_split_payment: isMultiplePayments,
              fee_percentage: 0,
              fee_amount: record.total_fee,
              net_amount: Number(record.total_amount),
              payment_status: 'COMPLETED',
              settlement_status: isMultiplePayments ? 'DIRECT' : (isGateway ? 'PENDING' : 'DIRECT'),
              status: 'COMPLETED',
              platform: 'Binance',
              wallet_id: record.wallet_id,
              source: 'terminal_small_sales',
              sale_type: 'small_sale',
              description: `Clubbed ${record.order_count} small ${record.asset_code} orders${isMultiplePayments ? ' (split payment)' : ''}`,
              created_by: userId,
              market_rate_usdt: marketRate,
              effective_usdt_qty: ssEffUsdtQty,
              effective_usdt_rate: ssEffUsdtRate,
            })
            .select('id')
            .single();

          if (soErr) {
            if (isDuplicateConstraintError(soErr) && attempt < 4) continue;
            throw soErr;
          }
          salesOrder = data;
        }

        if (!salesOrder) throw new Error('Failed to create sales order');
        createdSalesOrderId = salesOrder.id;

        // ── Bank/settlement legs + payment_splits rows ───────────────
        if (isMultiplePayments) {
          let hasAnyGateway = false;

          for (const split of paymentSplits) {
            const splitAmount = parseFloat(split.amount);
            if (splitAmount <= 0 || !split.payment_method_id) continue;

            const pm = paymentMethods!.find(m => m.id === split.payment_method_id);
            const resolvedBankAccountId = pm!.bank_account_id;
            const splitIsGateway = Boolean(pm?.payment_gateway);

            if (splitIsGateway) {
              hasAnyGateway = true;
              const expectedDate = pm?.settlement_days
                ? new Date(new Date(orderDate).getTime() + pm.settlement_days * 86400000)
                    .toISOString()
                    .split('T')[0]
                : new Date(new Date(orderDate).getTime() + 86400000)
                    .toISOString()
                    .split('T')[0];

              const { error: settlementErr } = await supabase
                .from('pending_settlements')
                .insert({
                  sales_order_id: salesOrder.id,
                  order_number: orderNumber,
                  client_name: 'Small Sales',
                  total_amount: splitAmount,
                  settlement_amount: splitAmount,
                  order_date: orderDate,
                  payment_method_id: split.payment_method_id,
                  bank_account_id: resolvedBankAccountId,
                  settlement_cycle: pm?.settlement_cycle || 'T+1 Day',
                  settlement_days: pm?.settlement_days || null,
                  expected_settlement_date: expectedDate,
                  status: 'PENDING',
                  created_by: userId,
                });
              if (settlementErr) throw settlementErr;
            } else {
              const { error: bankTxErr } = await supabase
                .from('bank_transactions')
                .insert({
                  bank_account_id: resolvedBankAccountId,
                  transaction_type: 'INCOME',
                  amount: splitAmount,
                  transaction_date: orderDate,
                  description: `Sales Order - ${orderNumber} - Small Sales (Split)`,
                  reference_number: orderNumber,
                  category: 'Sales',
                  related_account_name: 'Small Sales',
                  created_by: userId,
                });
              if (bankTxErr) throw bankTxErr;
            }

            const { error: splitInsertErr } = await supabase
              .from('sales_order_payment_splits')
              .insert({
                sales_order_id: salesOrder.id,
                bank_account_id: resolvedBankAccountId,
                amount: splitAmount,
                payment_method_id: split.payment_method_id,
                is_gateway: splitIsGateway,
                created_by: userId,
              });
            if (splitInsertErr) throw splitInsertErr;
          }

          if (hasAnyGateway) {
            await supabase
              .from('sales_orders')
              .update({ settlement_status: 'PENDING' })
              .eq('id', salesOrder.id);
          }
        } else {
          // Single-method path (existing behaviour preserved)
          const { error: splitErr } = await supabase.from('sales_order_payment_splits').insert({
            sales_order_id: salesOrder.id,
            bank_account_id: singleResolvedBankId,
            amount: Number(record.total_amount),
            payment_method_id: paymentMethodId,
            is_gateway: isGateway,
            created_by: userId,
          });
          if (splitErr) throw splitErr;

          if (isGateway) {
            // sales_orders already has create_pending_settlement_trigger, which inserts/updates
            // the gateway settlement row for single-method approvals. Inserting here again causes
            // a unique conflict on (sales_order_id, payment_method_id).
          } else {
            const { error: bankTxErr } = await supabase.from('bank_transactions').insert({
              bank_account_id: singleResolvedBankId,
              transaction_type: 'INCOME',
              amount: Number(record.total_amount),
              transaction_date: orderDate,
              description: `Sales Order - ${orderNumber} - Small Sales`,
              reference_number: orderNumber,
              category: 'Sales',
              related_account_name: 'Small Sales',
              created_by: userId,
            });
            if (bankTxErr) throw bankTxErr;
          }
        }

        // ── Wallet deduction (asset + fee) — same regardless of split ──
        if (record.wallet_id) {
          const totalWalletDebit = Number(record.total_quantity || 0) + Number(record.total_fee || 0);
          const { error: walletErr } = await supabase.rpc('process_sales_order_wallet_deduction', {
            sales_order_id: salesOrder.id,
            usdt_amount: totalWalletDebit,
            wallet_id: record.wallet_id,
            p_asset_code: record.asset_code,
          });
          if (walletErr) throw walletErr;
        }

        await persistBatchValuation({
          batchId: orderNumber,
          batchType: 'small_sales',
          assetCode,
          totalInrValue: ssTotalAmt,
          totalAssetQty: ssQty,
          marketRateUsdt: marketRate,
          aggregatedUsdtQty: ssEffUsdtQty,
          effectiveUsdtRate: ssEffUsdtRate,
          orderId: salesOrder.id,
          priceSnapshotId: locked.snapshotId,
          createdBy: userId,
        });

        const { error: syncUpdateErr } = await supabase
          .from('small_sales_sync')
          .update({
            sync_status: 'approved',
            sales_order_id: salesOrder.id,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', record.id);
        if (syncUpdateErr) throw syncUpdateErr;

        return salesOrder;
      } catch (error) {
        // On any failure, fully reverse what we created so the operator can retry.
        if (createdSalesOrderId) {
          await supabase.rpc('delete_sales_order_with_reversal', { p_order_id: createdSalesOrderId });
        }
        // Release the idempotency claim so the operator can retry after fixing the issue.
        if (claimed) {
          await supabase
            .from('small_sales_sync')
            .update({ sync_status: 'pending_approval' })
            .eq('id', record.id)
            .eq('sync_status', 'processing');
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Small sales entry created in ERP' });
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending_settlements'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['crypto_wallets'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      const { title, description } = parseApprovalError(err, 'Small Sales');
      toast({ title, description, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const userId = await requireCurrentUserId();
      await supabase
        .from('small_sales_sync')
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
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      onOpenChange(false);
    },
  });

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Small Sales Bulk Approval
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
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
              <p className="font-medium">₹{Number(record.avg_price).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Amount</span>
              <p className="font-semibold text-primary">₹{Number(record.total_amount).toLocaleString('en-IN')}</p>
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

          {/* USDT Equivalent for non-USDT assets */}
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

          {/* Payment Method + Split Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Payment Method *</Label>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="split-small-sales-payment"
                  checked={isMultiplePayments}
                  onCheckedChange={(checked) => {
                    setIsMultiplePayments(!!checked);
                    if (checked) {
                      setPaymentSplits([
                        { payment_method_id: '', amount: totalAmount > 0 ? totalAmount.toFixed(2) : '' },
                      ]);
                      setPaymentMethodId('');
                    } else {
                      setPaymentSplits([{ payment_method_id: '', amount: '' }]);
                    }
                  }}
                />
                <Label htmlFor="split-small-sales-payment" className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                  Split Payment
                </Label>
              </div>
            </div>

            {!isMultiplePayments ? (
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nickname || m.type} {m.payment_gateway ? '(Gateway)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 h-9 flex items-center">
                Configure payment distribution below
              </div>
            )}
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

                <div className="grid grid-cols-3 gap-4 text-sm bg-background/80 rounded-lg p-3 border">
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px] mb-1">Total Amount</div>
                    <div className="font-semibold text-xs">
                      ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="text-center border-x">
                    <div className="text-muted-foreground text-[10px] mb-1">Allocated</div>
                    <div className="font-medium text-xs">
                      ₹{splitAllocation.totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px] mb-1">Remaining</div>
                    <div className={`font-semibold text-xs ${splitAllocation.isValid ? 'text-green-600' : 'text-destructive'}`}>
                      ₹{splitAllocation.remaining.toFixed(2)}
                    </div>
                  </div>
                </div>

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
                          onChange={e => updatePaymentSplit(index, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="col-span-7">
                        <Select
                          value={split.payment_method_id}
                          onValueChange={value => updatePaymentSplit(index, 'payment_method_id', value)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                            {paymentMethods?.map((method: any) => (
                              <SelectItem key={method.id} value={method.id}>
                                {method.nickname || method.type} {method.payment_gateway ? '(Gateway)' : ''}
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
                  Add Another Payment Method
                </Button>
              </CardContent>
            </Card>
          )}

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
                disabled={
                  approveMutation.isPending ||
                  (isMultiplePayments ? !splitAllocation.isValid : !paymentMethodId)
                }
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
