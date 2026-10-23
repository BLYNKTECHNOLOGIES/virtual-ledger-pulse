import { useState, useEffect, useMemo } from 'react';
import { parseApprovalError } from '@/utils/approvalErrorParser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle, XCircle, Package, Coins, Plus, Minus, Loader2, Info, Lock, Building2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/lib/system-action-logger';
import { fetchAndLockMarketRate, linkSnapshotToReference, persistBatchValuation } from '@/lib/effectiveUsdtEngine';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';
import { useActiveBankAccounts } from '@/hooks/useActiveBankAccounts';
import {
  BatchStatusChip,
  Chip,
  CopyButton,
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  Field,
  FieldGrid,
  OrderNo,
  Section,
  SummaryRow,
  ToggleRow,
  dialogContentClass,
  fmtAssetQty,
  fmtDate,
  fmtDateTime,
  fmtInr,
  fmtRate,
  fmtTime,
  safeDate,
} from '@/components/orders-ui';
import { cn } from '@/lib/utils';

const PAYOUT_GATEWAY_FEE_CATEGORY = 'Finance, Banking & Compliance > Payout Gateway Fee';

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
      fetchAndLockMarketRate(assetCode, { entryType: 'small_buys_preview' })
        .then(locked => setCoinUsdtRate(locked.price))
        .catch(() => setCoinUsdtRate(null));
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

      // Lock the CoinUSDT rate before anything is written: the purchase adds its cost at this rate.
      const locked = await fetchAndLockMarketRate(assetCode, { entryType: 'batch_approval' });
      const marketRate = locked.price;

      let result: any;
      let rpcError: any;

      if (isMultiplePayments) {
        const splitPaymentsJson = paymentSplits.map(s => ({
          bank_account_id: s.bank_account_id,
          amount: parseFloat(s.amount),
        }));

        const { data, error } = await supabase.rpc('create_manual_purchase_with_split_payments_rpc' as any, {
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
          p_market_rate_usdt: marketRate,
        });
        result = data;
        rpcError = error;
      } else {
        const { data, error } = await supabase.rpc('create_manual_purchase_complete_v2_rpc' as any, {
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
          p_market_rate_usdt: marketRate,
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
        await linkSnapshotToReference(locked.snapshotId, result.purchase_order_id, 'purchase_order');
        const rawFee = totalFee;
        const feeUsdt = assetCode === 'USDT' ? rawFee : rawFee * (marketRate > 0 ? marketRate : 0);

        const sbEffRate = marketRate > 0 ? marketRate : 1;
        const sbQty = Number(record.total_quantity || 0);
        const sbTotalAmt = Number(record.total_amount || 0);
        const sbEffUsdtQty = sbQty * sbEffRate;
        const sbEffUsdtRate = sbEffUsdtQty > 0 ? sbTotalAmt / sbEffUsdtQty : null;

        await supabase
          .from('purchase_orders')
          .update({
            source: 'terminal_small_buys',
            market_rate_usdt: marketRate > 0 ? marketRate : null,
            fee_amount: feeUsdt > 0 ? feeUsdt : null,
            effective_usdt_qty: sbEffUsdtQty,
            effective_usdt_rate: sbEffUsdtRate,
          })
          .eq('id', result.purchase_order_id);

        // Persist batch valuation record
        const orderNumber = `SB${String((await supabase.from('small_buys_sync' as any).select('id', { count: 'exact', head: true }).eq('sync_status', 'approved')).count || 0).padStart(5, '0')}`;
        await persistBatchValuation({
          batchId: orderNumber,
          batchType: 'small_buys',
          assetCode,
          totalInrValue: sbTotalAmt,
          totalAssetQty: sbQty,
          marketRateUsdt: marketRate,
          aggregatedUsdtQty: sbEffUsdtQty,
          effectiveUsdtRate: sbEffUsdtRate,
          orderId: result.purchase_order_id,
          priceSnapshotId: locked.snapshotId,
          createdBy: userId || undefined,
        });
      }

      // Record gateway fee as a separate operating expense, not as purchase cost/COGS.
      // This is NOT a purchase cost — it's tracked as an operational expense only.
      // The trg_update_bank_account_balance trigger auto-deducts from the selected bank balance.
      if (gatewayFeeEnabled && parseFloat(gatewayFeeAmount) > 0 && gatewayFeeBankId) {
        const feeAmt = parseFloat(gatewayFeeAmount);
        const { data: existingFeeRows, error: existingFeeError } = await supabase
          .from('bank_transactions')
          .select('id')
          .eq('reference_number', orderNumber)
          .eq('transaction_type', 'EXPENSE')
          .or(`category.eq.${PAYOUT_GATEWAY_FEE_CATEGORY},description.ilike.%Payout gateway fee%`)
          .limit(1);

        if (existingFeeError) {
          throw new Error(`Could not verify existing payout gateway fee: ${existingFeeError.message}`);
        }

        if (existingFeeRows?.length) {
          throw new Error(`Payout gateway fee already exists for ${orderNumber}. Duplicate expense was not created.`);
        }

        const { error: feeError } = await supabase.from('bank_transactions').insert({
          bank_account_id: gatewayFeeBankId,
          transaction_type: 'EXPENSE',
          amount: feeAmt,
          category: PAYOUT_GATEWAY_FEE_CATEGORY,
          description: `Payout gateway fee for ${orderNumber} (${record.asset_code}, ${record.order_count} orders)`,
          reference_number: orderNumber,
          transaction_date: settlementDate,
          created_by: userId,
        });
        if (feeError) {
          console.error('Gateway fee expense creation failed:', feeError);
          throw new Error(`Purchase approved but gateway fee recording failed: ${feeError.message}`);
        }
      }

      return result;
    },
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Small buys purchase entry created in ERP' });
      queryClient.invalidateQueries({ queryKey: ['small_buys_sync'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
      queryClient.invalidateQueries({ queryKey: ['crypto_wallets'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      const { title, description } = parseApprovalError(err, 'Small Buys');
      toast({ title, description, variant: 'destructive' });
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
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      onOpenChange(false);
    },
  });

  if (!record) return null;

  const isSubmitDisabled = approveMutation.isPending ||
    (isMultiplePayments ? !splitAllocation.isValid : !bankAccountId) ||
    (gatewayFeeEnabled && (!gatewayFeeAmount || parseFloat(gatewayFeeAmount) <= 0 || !gatewayFeeBankId));

  // ── Presentation only: derived from the batch record and the state above; nothing here is saved ──
  const orderNumbers: string[] = Array.isArray(record.order_numbers) ? record.order_numbers.filter(Boolean).map(String) : [];
  const windowLabel = timeWindowLabel(record.time_window_start, record.time_window_end);
  const feeIncomplete = gatewayFeeEnabled && (!gatewayFeeAmount || parseFloat(gatewayFeeAmount) <= 0 || !gatewayFeeBankId);
  // Why Approve is disabled: the conditions of isSubmitDisabled, in the same order.
  const blockingReason = approveMutation.isPending ? null
    : isMultiplePayments && !splitAllocation.isValid
      ? (Math.abs(splitAllocation.remaining) > 0.01 ? `Remaining ${inr2(splitAllocation.remaining)} must be ₹0.00` : 'Choose a bank and an amount on every row')
      : !isMultiplePayments && !bankAccountId ? 'Select a bank account to approve'
      : feeIncomplete ? 'Enter the gateway fee amount and its bank'
      : null;

  const bankOption = (ba: { account_name: string; balance: number }) => (
    <>
      {ba.account_name}
      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{inr2(Number(ba.balance))}</span>
    </>
  );

  const settlementField = (
    <Field label="Settlement date" htmlFor="sb-settlement-date" hint="Used as the purchase order date and the fee date.">
      <Input
        id="sb-settlement-date"
        type="date"
        value={settlementDate}
        onChange={(e) => setSettlementDate(e.target.value)}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("lg")}>
        <DialogHead
          icon={Package}
          title="Approve small buys batch"
          description={`Creates one purchase order from ${record.order_count} small ${assetCode} buys.`}
          meta={
            <>
              <BatchStatusChip status={record.sync_status} />
              <CachedAccountChip accountId={record.exchange_account_id} />
            </>
          }
        />

        <DialogBody>
          {/* Summary */}
          <Section
            title={sectionTitle("Batch")}
            icon={Lock}
            actions={<span className="text-[11px] text-muted-foreground">Read-only</span>}
            boxed
          >
            <Facts
              cols={3}
              className="grid-cols-2"
              items={[
                {
                  label: 'Total amount',
                  value: <span className="text-lg font-semibold leading-7 tabular-nums">{fmtInr(record.total_amount)}</span>,
                  className: 'col-span-2 sm:col-span-1',
                },
                { label: 'Total quantity', value: <span className="tabular-nums">{fmtAssetQty(record.total_quantity, assetCode)}</span> },
                { label: `Avg price per ${assetCode}`, value: <span className="tabular-nums">{fmtRate(record.avg_price)}</span> },
                { label: 'Orders clubbed', value: <span className="tabular-nums">{Number(record.order_count || 0).toLocaleString('en-IN')}</span> },
                { label: 'Total fee', value: <span className="tabular-nums">{fmtAssetQty(record.total_fee, assetCode)}</span> },
                { label: 'Wallet', value: record.wallet_name || '—' },
                { label: 'Time window', value: <span className="tabular-nums">{windowLabel}</span>, className: 'col-span-2 sm:col-span-3' },
              ]}
            />

            {/* USDT Equivalent */}
            {isNonUsdt && coinUsdtRate && coinUsdtRate > 0 && (() => {
              const qty = Number(record.total_quantity || 0);
              const totalAmt = Number(record.total_amount || 0);
              const usdtEquivQty = qty * coinUsdtRate;
              const equivUsdtRate = usdtEquivQty > 0 ? totalAmt / usdtEquivQty : 0;
              return (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <Coins className="h-3.5 w-3.5" aria-hidden />
                    USDT equivalent (live)
                  </p>
                  <Facts
                    cols={3}
                    className="grid-cols-3"
                    items={[
                      { label: `${assetCode}/USDT`, value: <span className="tabular-nums">{formatSmartDecimal(coinUsdtRate, 6)}</span> },
                      { label: 'USDT qty', value: <span className="tabular-nums">{formatSmartDecimal(usdtEquivQty, 4)}</span> },
                      { label: 'USDT rate', value: <span className="tabular-nums">₹{formatSmartDecimal(equivUsdtRate, 2)}</span> },
                    ]}
                  />
                </div>
              );
            })()}
          </Section>

          {orderNumbers.length > 0 && (
            <Section title={sectionTitle("Binance orders")} description={`${orderNumbers.length.toLocaleString('en-IN')} ${orderNumbers.length === 1 ? 'order' : 'orders'} in this batch`}>
              <ol className="max-h-48 divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card">
                {orderNumbers.map((orderNo, i) => (
                  <li key={`${orderNo}-${i}`} className="flex min-w-0 items-center gap-3 px-3 py-1">
                    <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                    <OrderNo value={orderNo} className="min-w-0 truncate" />
                    <CopyButton value={orderNo} label="Copy order number" className="ml-auto" />
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* TDS Option */}
          <Section title={sectionTitle("Tax")}>
            <FieldGrid>
              <Field label="TDS" htmlFor="sb-tds">
                <Select value={tdsOption} onValueChange={(v) => setTdsOption(v as any)}>
                  <SelectTrigger id="sb-tds">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No TDS</SelectItem>
                    <SelectItem value="1%">1% TDS (with PAN)</SelectItem>
                    <SelectItem value="20%">20% TDS (without PAN)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {tdsOption !== 'none' && (
                <Field label="PAN number" htmlFor="sb-pan" required={tdsOption === '1%'}>
                  <Input
                    id="sb-pan"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="font-mono"
                  />
                </Field>
              )}
            </FieldGrid>
            {tdsOption !== 'none' && (
              <div className="mt-3 rounded-lg border border-border bg-card px-3 py-1">
                <SummaryRow label="Total amount" value={fmtInr(totalAmount)} />
                <SummaryRow label={`TDS at ${tdsOption}`} value={`−${fmtInr(tdsAmount)}`} />
                <SummaryRow label="Net payable" value={fmtInr(netPayable)} strong />
              </div>
            )}
          </Section>

          {/* Bank Account / Split Payment */}
          <Section
            title={sectionTitle("Payment")}
            actions={
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
                <Label htmlFor="split-payment" className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Split payment
                </Label>
              </div>
            }
          >
            {!isMultiplePayments ? (
              <FieldGrid>
                <Field label="Bank account" htmlFor="sb-bank">
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger id="sb-bank">
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((ba) => (
                        <SelectItem key={ba.id} value={ba.id}>
                          {bankOption(ba)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {settlementField}
              </FieldGrid>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="hidden grid-cols-[9rem_minmax(0,1fr)_2.25rem] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:grid" aria-hidden>
                    <span>Amount (₹)</span>
                    <span>Bank account</span>
                    <span />
                  </div>

                  {paymentSplits.map((split, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 rounded-lg border border-border/70 p-2 sm:grid-cols-[9rem_minmax(0,1fr)_2.25rem] sm:rounded-none sm:border-0 sm:p-0">
                      <Input
                        type="number"
                        className="col-start-1 row-start-1 tabular-nums"
                        value={split.amount}
                        onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                        placeholder="0.00"
                        aria-label={`Amount for bank ${index + 1} (₹)`}
                      />
                      <Select
                        value={split.bank_account_id}
                        onValueChange={(v) => updatePaymentSplit(index, 'bank_account_id', v)}
                      >
                        <SelectTrigger
                          aria-label={`Bank account ${index + 1}`}
                          className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                        >
                          <SelectValue placeholder="Select bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map((ba) => (
                            <SelectItem key={ba.id} value={ba.id}>
                              {bankOption(ba)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="col-start-2 row-start-1 h-9 w-9 shrink-0 text-muted-foreground sm:col-start-3"
                        onClick={() => removePaymentSplit(index)}
                        disabled={paymentSplits.length <= 1}
                        aria-label={`Remove bank ${index + 1}`}
                        title="Remove this bank"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <Button type="button" variant="outline" size="sm" onClick={addPaymentSplit} className="w-full">
                    <Plus className="h-4 w-4" />
                    Add another bank
                  </Button>

                  <div className="rounded-lg border border-border bg-card px-3 py-1">
                    <SummaryRow label="Net payable" value={inr2(netPayable)} />
                    <SummaryRow label="Allocated" value={inr2(splitAllocation.totalAllocated)} />
                    <SummaryRow
                      label="Remaining"
                      value={inr2(splitAllocation.remaining)}
                      tone={Math.abs(splitAllocation.remaining) <= 0.01 ? 'positive' : 'negative'}
                      strong
                    />
                  </div>
                </div>
                <FieldGrid>{settlementField}</FieldGrid>
              </div>
            )}
          </Section>

          {/* Payout Gateway Fee */}
          <ToggleRow
            title="Payout gateway fee"
            description={gatewayFeeEnabled ? 'This fee will be recorded as a separate expense, not as a purchasing cost.' : undefined}
            control={
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
                <Label htmlFor="gateway-fee" className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Apply fee
                </Label>
              </div>
            }
          >
            {gatewayFeeEnabled && (
              <FieldGrid>
                <Field label="Fee amount (₹)" htmlFor="sb-fee-amount">
                  <Input
                    id="sb-fee-amount"
                    type="number"
                    value={gatewayFeeAmount}
                    onChange={(e) => setGatewayFeeAmount(e.target.value)}
                    placeholder="0.00"
                    className="tabular-nums"
                  />
                </Field>
                <Field label="Fee deducted from" htmlFor="sb-fee-bank">
                  <Select value={gatewayFeeBankId} onValueChange={setGatewayFeeBankId}>
                    <SelectTrigger id="sb-fee-bank">
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((ba) => (
                        <SelectItem key={ba.id} value={ba.id}>
                          {bankOption(ba)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGrid>
            )}
          </ToggleRow>

          {/* Reject section */}
          {showReject && (
            <Section title={sectionTitle("Reject batch")} description="The batch is marked rejected and no purchase order is created.">
              <Field
                label="Rejection reason"
                htmlFor="sb-reject-reason"
                hint="Optional. Saved as “Rejected by operator” when left empty."
              >
                <Textarea
                  id="sb-reject-reason"
                  className="min-h-[64px]"
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Reason for rejection…"
                  autoFocus
                />
              </Field>
            </Section>
          )}
        </DialogBody>

        {!showReject ? (
          <DialogFoot
            start={
              <Button
                type="button"
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setShowReject(true)}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            }
          >
            {blockingReason && (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {blockingReason}
              </span>
            )}
            <Button
              type="button"
              disabled={isSubmitDisabled}
              onClick={() => approveMutation.mutate()}
            >
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {approveMutation.isPending ? 'Approving…' : 'Approve & create purchase'}
            </Button>
          </DialogFoot>
        ) : (
          <DialogFoot>
            <Button type="button" variant="outline" onClick={() => setShowReject(false)}>Back</Button>
            <Button type="button" variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {rejectMutation.isPending ? 'Rejecting…' : 'Confirm reject'}
            </Button>
          </DialogFoot>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Presentation helpers (private to this dialog) ─────────────────────── */

/**
 * Section heading text. Sized here too because a global phone rule in index.css
 * (max-width 767px: h3 { font-size: 1rem !important }) would otherwise blow the kit's 11px label up to 16px.
 */
function sectionTitle(text: string) {
  return <span className="text-[11px] leading-4">{text}</span>;
}

/** ₹ with Indian grouping and exactly two decimals (₹14,727.70, ₹0.00). Display only. */
function inr2(value: number): string {
  const n = Math.abs(value) < 0.005 ? 0 : value;
  return `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "16 Oct 2026, 08:47 – 11:07", or both ends in full when the window spans days. Never throws. */
function timeWindowLabel(start: unknown, end: unknown): string {
  const s = safeDate(start);
  const e = safeDate(end);
  if (!s && !e) return "—";
  if (s && e && fmtDate(s) === fmtDate(e)) return `${fmtDate(s)}, ${fmtTime(s)} – ${fmtTime(e)}`;
  return `${s ? fmtDateTime(s) : "—"} – ${e ? fmtDateTime(e) : "—"}`;
}

/**
 * Exchange-account chip read from the ['exchange-account-map'] cache that the lists' account badges
 * fill. It never fetches, so it is simply absent when nothing has cached the map yet.
 */
function CachedAccountChip({ accountId, className }: { accountId?: string | null; className?: string }) {
  const queryClient = useQueryClient();
  if (!accountId) return null;
  const map = queryClient.getQueryData(["exchange-account-map"]) as Map<string, { account_name?: string | null; color?: string | null }> | undefined;
  const account = map instanceof Map ? map.get(accountId) : undefined;
  if (!account?.account_name) return null;
  const label = account.account_name.replace(/\s*binance\s*$/i, "").trim() || account.account_name;
  return (
    <Chip tone="neutral" title={account.account_name} className={cn("max-w-full", className)}>
      {account.color ? (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
      ) : (
        <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </Chip>
  );
}
