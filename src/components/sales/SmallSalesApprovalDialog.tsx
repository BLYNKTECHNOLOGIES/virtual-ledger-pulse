import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { parseApprovalError } from '@/utils/approvalErrorParser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Package, Building2, Plus, Minus, AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { requireCurrentUserId } from '@/lib/system-action-logger';
import { fetchAndLockMarketRate, persistBatchValuation } from '@/lib/effectiveUsdtEngine';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';
import { isAdjustmentBank } from '@/lib/adjustment-accounts';
import { cn } from '@/lib/utils';
import {
  BatchStatusChip,
  Chip,
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  Field,
  LIST_DENSITY,
  LIST_TABLE,
  OrderNo,
  Section,
  SummaryRow,
  dialogContentClass,
  fmtAssetQty,
  fmtDate,
  fmtDateTime,
  fmtInr,
  fmtRate,
  fmtTime,
  safeDate,
} from '@/components/orders-ui';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: any;
}

interface PaymentSplit {
  payment_method_id: string;
  amount: string;
}

// The approval call writes several tables; only a clash on the order number is retried with a fresh number.
function isDuplicateConstraintError(error: any): boolean {
  const message = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (message.includes('23505') || message.includes('duplicate key') || message.includes('unique constraint'))
    && message.includes('order_number');
}

/**
 * create_sales_order_with_postings saves everything or nothing. When the database answered with an error
 * (it carries a 5-character SQLSTATE code), nothing was saved: say so, unless the message already does.
 * A network error carries no code; then the outcome is unknown and the message is left as it is.
 */
function withNothingSaved(err: unknown, description: string): string {
  const e = err as { fromApprovalCall?: boolean; code?: unknown } | null;
  if (!e?.fromApprovalCall || !/^[0-9A-Z]{5}$/.test(String(e.code ?? ''))) return description;
  if (/nothing was saved/i.test(description)) return description;
  const text = description.trim();
  return `${text}${/[.!?]$/.test(text) ? '' : '.'} Nothing was saved.`;
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

      // ── Live status re-check ──────────────────────────────────────
      // An order can be COMPLETED when the batch is pulled and CANCELLED by
      // Binance afterwards. Never book a non-completed order into ERP: prune it
      // from the batch, recompute the totals, and make the operator re-open.
      const batchOrderNumbers: string[] = Array.isArray(record.order_numbers) ? record.order_numbers : [];
      if (batchOrderNumbers.length > 0) {
        const liveRows: any[] = [];
        for (let i = 0; i < batchOrderNumbers.length; i += 500) {
          const { data, error } = await supabase
            .from('binance_order_history')
            .select('order_number, order_status, amount, total_price, commission')
            .in('order_number', batchOrderNumbers.slice(i, i + 500));
          if (error) throw error;
          liveRows.push(...(data || []));
        }
        const statusByOrder = new Map<string, any>(liveRows.map((r) => [r.order_number, r]));
        const stale = batchOrderNumbers.filter((num) => {
          const row = statusByOrder.get(num);
          return row && String(row.order_status).toUpperCase() !== 'COMPLETED';
        });

        if (stale.length > 0) {
          const keep = batchOrderNumbers.filter((num) => !stale.includes(num));
          const kept = keep.map((num) => statusByOrder.get(num)).filter(Boolean);
          const totalQty = kept.reduce((s, o) => s + parseFloat(o.amount || '0'), 0);
          const totalAmt = kept.reduce((s, o) => s + parseFloat(o.total_price || '0'), 0);
          const totalFee = kept.reduce((s, o) => s + parseFloat(o.commission || '0'), 0);

          await supabase
            .from('small_sales_order_map')
            .delete()
            .eq('small_sales_sync_id', record.id)
            .in('binance_order_number', stale);

          await supabase
            .from('small_sales_sync')
            .update({
              order_numbers: keep,
              order_count: keep.length,
              total_quantity: totalQty,
              total_amount: totalAmt,
              total_fee: totalFee,
              avg_price: totalQty > 0 ? totalAmt / totalQty : 0,
            })
            .eq('id', record.id);

          queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
          queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
          throw new Error(
            `${stale.length} order(s) were cancelled on Binance after this batch was pulled and have been removed. ` +
            `New total: ₹${totalAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}. Please re-open this batch and approve again.`,
          );
        }
      }


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

      // No claim or rollback is needed: the order, its postings, the wallet debit and the batch's approval
      // mark are saved by ONE database call (create_sales_order_with_postings), which locks the batch, refuses
      // it unless it is still pending, and saves everything or nothing.
      {
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

        // ── Bank/settlement legs, payment_splits rows and the wallet debit, saved with the order ──
        const postingSteps = (orderNumber: string) => {
          const steps: any[] = [];

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

                steps.push({
                  op: 'insert',
                  table: 'pending_settlements',
                  order_id_column: 'sales_order_id',
                  row: {
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
                  },
                });
              } else {
                steps.push({
                  op: 'insert',
                  table: 'bank_transactions',
                  row: {
                    bank_account_id: resolvedBankAccountId,
                    transaction_type: 'INCOME',
                    amount: splitAmount,
                    transaction_date: orderDate,
                    description: `Sales Order - ${orderNumber} - Small Sales (Split)`,
                    reference_number: orderNumber,
                    category: 'Sales',
                    related_account_name: 'Small Sales',
                    created_by: userId,
                  },
                });
              }

              steps.push({
                op: 'insert',
                table: 'sales_order_payment_splits',
                order_id_column: 'sales_order_id',
                row: {
                  bank_account_id: resolvedBankAccountId,
                  amount: splitAmount,
                  payment_method_id: split.payment_method_id,
                  is_gateway: splitIsGateway,
                  created_by: userId,
                },
              });
            }

            if (hasAnyGateway) {
              steps.push({ op: 'update_order', set: { settlement_status: 'PENDING' } });
            }

            // Guarantee one pending settlement per gateway split
            steps.push({ op: 'sync_split_settlements' });
          } else {
            // Single-method path (existing behaviour preserved)
            steps.push({
              op: 'insert',
              table: 'sales_order_payment_splits',
              order_id_column: 'sales_order_id',
              row: {
                bank_account_id: singleResolvedBankId,
                amount: Number(record.total_amount),
                payment_method_id: paymentMethodId,
                is_gateway: isGateway,
                created_by: userId,
              },
            });

            if (isGateway) {
              // sales_orders already has create_pending_settlement_trigger, which inserts/updates
              // the gateway settlement row for single-method approvals. Inserting here again causes
              // a unique conflict on (sales_order_id, payment_method_id).
            } else {
              steps.push({
                op: 'insert',
                table: 'bank_transactions',
                row: {
                  bank_account_id: singleResolvedBankId,
                  transaction_type: 'INCOME',
                  amount: Number(record.total_amount),
                  transaction_date: orderDate,
                  description: `Sales Order - ${orderNumber} - Small Sales`,
                  reference_number: orderNumber,
                  category: 'Sales',
                  related_account_name: 'Small Sales',
                  created_by: userId,
                },
              });
            }
          }

          // ── Wallet deduction (asset + fee) — same regardless of split ──
          if (record.wallet_id) {
            const totalWalletDebit = Number(record.total_quantity || 0) + Number(record.total_fee || 0);
            steps.push({ op: 'wallet_deduction', wallet_id: record.wallet_id, amount: totalWalletDebit, asset_code: record.asset_code });
          }

          return steps;
        };

        // ── Create the sales order with its postings and mark the batch approved, in one call ──
        // Retry order-number collisions so a stale sequence can never block approval
        // (a failed call saves nothing, so trying again with a fresh number is safe).
        let orderNumber = '';
        let salesOrder: { id: string } | null = null;
        for (let attempt = 0; attempt < 5 && !salesOrder; attempt++) {
          const { data: nextOrderNum, error: orderNumErr } = await supabase.rpc('next_small_sales_order_number');
          if (orderNumErr || !nextOrderNum) throw orderNumErr || new Error('Failed to generate order number');
          orderNumber = nextOrderNum as string;

          const { data, error: soErr } = await supabase.rpc('create_sales_order_with_postings' as any, {
            p_order: {
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
            },
            p_steps: postingSteps(orderNumber),
            p_source: {
              table: 'small_sales_sync',
              id: record.id,
              set: { reviewed_by: userId, reviewed_at: new Date().toISOString() },
            },
          });

          if (soErr) {
            if (isDuplicateConstraintError(soErr) && attempt < 4) continue;
            throw Object.assign(soErr, { fromApprovalCall: true });
          }
          salesOrder = { id: (data as unknown as { sales_order_id: string }).sales_order_id };
        }

        if (!salesOrder) throw new Error('Failed to create sales order');

        // The batch is approved. The valuation record is reporting only (not money or stock), so a failure here
        // must not show an error (that makes people approve again); it is shown as a warning instead.
        const notSaved: string[] = [];
        try {
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
        } catch {
          notSaved.push('the USDT valuation record');
        }

        return { salesOrder, notSaved };
      }
    },
    onSuccess: ({ notSaved }) => {
      if (notSaved.length > 0) {
        toast({ title: 'Approved', description: `Small sales entry created in ERP, but ${notSaved.join(', ')} did not save.`, variant: 'warning' });
      } else {
        toast({ title: 'Approved', description: 'Small sales entry created in ERP' });
      }
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
      toast({ title, description: withNothingSaved(err, description), variant: 'destructive' });
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

  /* ── Presentation only: everything below is derived from the record and the state above ── */
  const account = cachedExchangeAccount(queryClient, record.exchange_account_id);
  const orderNumbers: string[] = Array.isArray(record.order_numbers) ? record.order_numbers : [];
  const selectedMethodRow: any = isMultiplePayments ? null : paymentMethods?.find((m: any) => m.id === paymentMethodId);
  const hasDuplicateSplitMethods = isMultiplePayments && new Set(paymentSplits.map((s) => s.payment_method_id)).size !== paymentSplits.length;
  // Why Approve is disabled (same order as its disabled condition), or what would stop the approval.
  const footNote = showReject || approveMutation.isPending
    ? null
    : isMultiplePayments
      ? !splitAllocation.isValid
        ? splitNote(splitAllocation.remaining)
        : hasDuplicateSplitMethods
          ? 'Use a different payment method on every row'
          : null
      : !paymentMethodId
        ? 'Select a payment method to approve'
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass('lg')}>
        <DialogHead
          icon={Package}
          title="Approve small sales batch"
          description={`Creates one sales order from ${record.order_count} small ${assetCode} sales.`}
          meta={
            <>
              <BatchStatusChip status={record.sync_status} />
              {account && <AccountChip account={account} />}
            </>
          }
        />

        <DialogBody>
          <Section title={sectionHeading('Batch')} boxed>
            <Facts
              cols={3}
              className="grid-cols-2"
              items={[
                { label: 'Total amount', value: <span className="text-lg font-semibold leading-6 tabular-nums">{fmtInr(record.total_amount)}</span> },
                { label: 'Asset', value: record.asset_code },
                { label: 'Orders clubbed', value: <span className="tabular-nums">{record.order_count}</span> },
                { label: 'Total quantity', value: <span className="tabular-nums">{fmtAssetQty(record.total_quantity, record.asset_code)}</span> },
                { label: 'Avg price', value: <span className="tabular-nums">{fmtRate(record.avg_price)}</span> },
                { label: 'Total fee', value: <span className="tabular-nums">{fmtAssetQty(record.total_fee, record.asset_code)}</span> },
                { label: 'Wallet', value: record.wallet_name || '—' },
                { label: 'Time window', value: timeWindowLabel(record.time_window_start, record.time_window_end), span: 2, className: 'col-span-2' },
              ]}
            />
          </Section>

          {/* USDT equivalent for non-USDT assets */}
          {isNonUsdt && !!coinUsdtRate && coinUsdtRate > 0 && (() => {
            const qty = Number(record.total_quantity || 0);
            const totalAmt = Number(record.total_amount || 0);
            const usdtEquivQty = qty * coinUsdtRate;
            const equivUsdtRate = usdtEquivQty > 0 ? totalAmt / usdtEquivQty : 0;
            return (
              <Section title={sectionHeading('USDT equivalent (live)')} description="Preview only. The rate is fetched again when you approve." boxed>
                <Facts
                  cols={3}
                  className="grid-cols-3"
                  items={[
                    { label: `${assetCode}/USDT`, value: <span className="tabular-nums">{formatSmartDecimal(coinUsdtRate, 6)}</span> },
                    { label: 'USDT qty', value: <span className="tabular-nums">{formatSmartDecimal(usdtEquivQty, 4)}</span> },
                    { label: 'USDT rate', value: <span className="tabular-nums">₹{formatSmartDecimal(equivUsdtRate, 2)}</span> },
                  ]}
                />
              </Section>
            );
          })()}

          {/* Payment Method + Split Toggle */}
          <Section title={sectionHeading('Payment')} bodyClassName="space-y-3">
            <Field
              label="Payment method"
              required
              htmlFor={isMultiplePayments ? undefined : 'ssa-payment-method'}
              hint={selectedMethodRow && selectedMethodRow.bank_account_id ? settlementLine(selectedMethodRow) : undefined}
              error={selectedMethodRow && !selectedMethodRow.bank_account_id ? 'No bank account is linked to this method, so the approval will stop with an error.' : undefined}
              aside={
                <div className="flex items-center gap-2">
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
                  <Label htmlFor="split-small-sales-payment" className="cursor-pointer whitespace-nowrap text-xs font-normal text-muted-foreground">
                    Split payment
                  </Label>
                </div>
              }
            >
              {!isMultiplePayments ? (
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger id="ssa-payment-method" className="h-9 text-left text-sm">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    {paymentMethods?.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nickname || m.type} {m.payment_gateway ? '(Gateway)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-lg border border-dashed border-border px-3 text-[13px] text-muted-foreground">
                  Split across the methods below
                </div>
              )}
            </Field>

            {/* Split Payment Distribution */}
            {isMultiplePayments && (
              <SplitEditor
                splits={paymentSplits}
                methods={paymentMethods || []}
                allocation={splitAllocation}
                totalAmount={totalAmount}
                methodLabel={(method: any) => `${method.nickname || method.type}${method.payment_gateway ? ' (Gateway)' : ''}`}
                onChange={updatePaymentSplit}
                onAdd={addPaymentSplit}
                onRemove={removePaymentSplit}
              />
            )}
          </Section>

          {orderNumbers.length > 0 && (
            <Section title={sectionHeading('Binance orders')}>
              <div className="max-h-44 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card">
                <table className={cn(LIST_TABLE, LIST_DENSITY.compact, 'table-fixed [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1] [&_thead_th]:bg-muted')}>
                  <colgroup>
                    <col className="w-14" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Order number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderNumbers.map((orderNumber, i) => (
                      <tr key={`${orderNumber}-${i}`}>
                        <td className="tabular-nums text-muted-foreground">{i + 1}</td>
                        <td>
                          <OrderNo value={orderNumber} className="block truncate" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {showReject && (
            <Section title={sectionHeading('Reject batch')} description="The batch is marked rejected and no sales order is created.">
              <Field label="Rejection reason" htmlFor="ssa-reject-reason" hint='Optional. Saved as "Rejected by operator" when left empty.'>
                <Textarea
                  id="ssa-reject-reason"
                  className="min-h-[64px] text-sm"
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Reason for rejection..."
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
                onClick={() => setShowReject(true)}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            }
          >
            {footNote && (
              // On phones the note takes its own line above the buttons.
              <span className="order-first flex min-w-0 basis-full items-center gap-1.5 text-xs text-muted-foreground sm:order-none sm:basis-auto">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {footNote}
              </span>
            )}
            <Button
              type="button"
              disabled={
                approveMutation.isPending ||
                (isMultiplePayments ? !splitAllocation.isValid : !paymentMethodId)
              }
              onClick={() => approveMutation.mutate()}
            >
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {approveMutation.isPending ? 'Approving…' : 'Approve & create sale'}
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

/** Section heading text; sized here because a global mobile rule enlarges every h3 to 16px. */
function sectionHeading(text: string) {
  return <span className="text-[11px] leading-4">{text}</span>;
}

/** "16 Oct 2026, 10:41 – 11:47", or both dates when the window spans days. */
function timeWindowLabel(start: unknown, end: unknown): string {
  const s = safeDate(start);
  const e = safeDate(end);
  if (s && e) return fmtDate(s) === fmtDate(e) ? `${fmtDate(s)}, ${fmtTime(s)} – ${fmtTime(e)}` : `${fmtDateTime(s)} – ${fmtDateTime(e)}`;
  if (s) return `From ${fmtDateTime(s)}`;
  if (e) return `Until ${fmtDateTime(e)}`;
  return '—';
}

/** Rupees with exactly two decimals (split totals): ₹40,960.51 */
function inr2(value: number): string {
  const n = Number.isFinite(value) && Math.abs(value) >= 0.005 ? value : 0;
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Where the money from the chosen method lands. */
function settlementLine(method: any): string {
  const account = method?.bank_accounts?.account_name;
  if (method?.payment_gateway) {
    return `Gateway payment · settles to ${account || 'the linked bank account'}${method.settlement_cycle ? ` (${method.settlement_cycle})` : ''}`;
  }
  return account ? `Direct payment · credited to ${account}` : 'Direct payment';
}

/** Why an invalid split allocation can't be approved yet. */
function splitNote(remaining: number): string {
  if (Math.abs(remaining) > 0.01) return `Remaining ${inr2(remaining)} must be ₹0.00`;
  return 'Choose a payment method and an amount on every row';
}

type ExchangeAccount = { id: string; account_name: string; color: string | null };

/** The record's exchange account from the ["exchange-account-map"] cache the lists already filled (never fetches). */
function cachedExchangeAccount(queryClient: ReturnType<typeof useQueryClient>, accountId?: string | null): ExchangeAccount | null {
  if (!accountId) return null;
  const map = queryClient.getQueryData<Map<string, ExchangeAccount>>(['exchange-account-map']);
  return (map instanceof Map ? map.get(accountId) : undefined) ?? null;
}

/** Neutral exchange-account chip; the account's own colour only marks the dot (as in the purchase dialogs). */
function AccountChip({ account }: { account: ExchangeAccount }) {
  const label = account.account_name.replace(/\s*binance\s*$/i, '').trim() || account.account_name;
  return (
    <Chip tone="neutral" title={account.account_name} className="max-w-full">
      {account.color ? (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
      ) : (
        <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </Chip>
  );
}

type SplitAllocation = { totalAllocated: number; remaining: number; isValid: boolean };

/** Split payment rows with the running total. All state stays in the dialog. */
function SplitEditor({
  splits,
  methods,
  allocation,
  totalAmount,
  methodLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  splits: PaymentSplit[];
  methods: any[];
  allocation: SplitAllocation;
  totalAmount: number;
  methodLabel: (method: any) => ReactNode;
  onChange: (index: number, field: keyof PaymentSplit, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-foreground">Payment distribution</p>
        {allocation.isValid ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Fully allocated
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            Not fully allocated
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="hidden gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)_2.25rem]">
          <span>Amount (₹)</span>
          <span>Payment method</span>
          <span className="sr-only">Remove</span>
        </div>
        {splits.map((split, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_2.25rem]">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={split.amount}
              onChange={e => onChange(index, 'amount', e.target.value)}
              placeholder="0.00"
              className="col-start-1 row-start-1 h-9 text-sm tabular-nums"
              aria-label={`Split ${index + 1} amount (₹)`}
            />
            <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <Select value={split.payment_method_id} onValueChange={value => onChange(index, 'payment_method_id', value)}>
                <SelectTrigger className="h-9 text-left text-sm" aria-label={`Split ${index + 1} payment method`}>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 border border-border shadow-sm">
                  {methods.map((method: any) => (
                    <SelectItem key={method.id} value={method.id}>
                      {methodLabel(method)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              disabled={splits.length === 1}
              className="col-start-2 row-start-1 h-9 w-9 text-muted-foreground hover:text-foreground sm:col-start-3"
              aria-label={`Remove split ${index + 1}`}
              title="Remove split"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="h-8 gap-1.5">
        <Plus className="h-4 w-4" />
        Add payment method
      </Button>

      <div>
        <SummaryRow label="Batch total" value={inr2(totalAmount)} />
        <SummaryRow label="Allocated" value={inr2(allocation.totalAllocated)} />
        <SummaryRow strong label="Remaining" value={inr2(allocation.remaining)} tone={allocation.isValid ? 'positive' : 'negative'} />
      </div>
    </div>
  );
}
