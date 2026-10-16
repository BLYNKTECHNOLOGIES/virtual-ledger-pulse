import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus, CheckCircle2, AlertCircle, Edit, Loader2 } from "lucide-react";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { isAdjustmentBank } from "@/lib/adjustment-accounts";
import { cn } from "@/lib/utils";
import { ShareBar } from "@/components/finance-ui/primitives";
import {
  Chip,
  CopyButton,
  DIALOG_FORM,
  DialogBody,
  DialogFoot,
  DialogHead,
  Field,
  FieldGrid,
  OrderNo,
  Section,
  dialogContentClass,
  fmtInr,
} from "@/components/orders-ui";

interface SalesPaymentSplit {
  payment_method_id: string;
  amount: string;
}

interface EditSalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

/* ── Presentation helpers (private; candidates for the orders-ui kit) ───── */

/**
 * Section heading text. The kit's Section renders its title in an <h3>, and a global phone rule
 * (src/index.css, max-width 767px: `h3 { font-size: 1rem !important }`) would blow it up to 16px;
 * this keeps the 11px label size on phones too.
 */
function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-[11px] leading-4">{children}</span>;
}

/** "₹" in front of an amount input. */
function RupeeAffix({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>
        ₹
      </span>
      {children}
    </div>
  );
}

/** "₹25,000.00": two decimals, for split allocation figures (display only). */
const money2 = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  // Wallets — active wallets plus this order's wallet (even if deactivated)
  const orderWalletId = order?.wallet_id || order?.wallet?.id || '';
  const { data: wallets } = useQuery<{ id: string; wallet_name: string; is_active: boolean }[]>({
    queryKey: ['edit_order_wallets', orderWalletId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('wallets')
        .select('id, wallet_name, is_active')
        .order('wallet_name');
      if (error) throw error;
      return (data || []).filter((w: any) => w.is_active || w.id === orderWalletId);
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
        if (isAdjustmentBank(method.bank_accounts?.account_name)) return false;
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

  // Initialize splits from existing data — also backfill formData if main field is empty
  useEffect(() => {
    if (existingSplits && existingSplits.length > 0) {
      const isMulti = existingSplits.length > 1 || !!order?.is_split_payment;
      setIsMultiplePayments(isMulti);
      setPaymentSplits(existingSplits.map((s: any) => ({
        payment_method_id: s.payment_method_id || '',
        amount: String(s.amount || ''),
      })));
      // Backfill single-select value from split when main order field is empty
      if (!isMulti && existingSplits.length === 1 && existingSplits[0].payment_method_id) {
        setFormData(prev => prev.sales_payment_method_id
          ? prev
          : { ...prev, sales_payment_method_id: existingSplits[0].payment_method_id }
        );
      }
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
        // 1. Reverse old bank transactions for this order's splits (immutable ledger — no deletes)
        const { data: oldTxs } = await supabase
          .from('bank_transactions')
          .select('id')
          .eq('reference_number', order.order_number)
          .eq('transaction_type', 'INCOME')
          .eq('is_reversed', false)
          .is('reverses_transaction_id', null);

        for (const t of oldTxs ?? []) {
          const { error: revErr } = await supabase.rpc('reverse_bank_transaction', {
            p_original_id: t.id,
            p_reason: `Sales order ${order.order_number} edited: split payment restructure`,
          });
          if (revErr) throw revErr;
        }

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
          const { error: splitErr } = await supabase.from('sales_order_payment_splits').insert({
            sales_order_id: order.id,
            bank_account_id: bankAccountId,
            amount: parseFloat(split.amount),
            payment_method_id: split.payment_method_id,
            is_gateway: isGateway,
          });
          if (splitErr) throw splitErr;

          // Create financial entry
          if (isGateway) {
            const splitAmount = parseFloat(split.amount);
            const orderDate = (data.order_date || new Date().toISOString()).split('T')[0];
            const settlementDays = (pm as any)?.settlement_days ?? null;
            const expectedDate = settlementDays != null
              ? new Date(new Date(orderDate).getTime() + settlementDays * 86400000).toISOString().split('T')[0]
              : new Date(new Date(orderDate).getTime() + 86400000).toISOString().split('T')[0];

            const { error: settlementErr } = await supabase.from('pending_settlements').insert({
              sales_order_id: order.id,
              payment_method_id: split.payment_method_id,
              bank_account_id: bankAccountId,
              total_amount: splitAmount,
              settlement_amount: splitAmount,
              settlement_cycle: (pm as any)?.settlement_cycle || 'T+1 Day',
              settlement_days: settlementDays,
              expected_settlement_date: expectedDate,
              status: 'PENDING',
              order_number: data.order_number,
              client_name: data.client_name,
              order_date: orderDate,
            });
            if (settlementErr) throw settlementErr;
          } else if (bankAccountId) {
            const { error: bankTxErr } = await supabase.from('bank_transactions').insert({
              bank_account_id: bankAccountId,
              transaction_type: 'INCOME',
              amount: parseFloat(split.amount),
              description: `Sales Order ${data.order_number} - Split Payment (${pm?.nickname || 'Direct Bank'})`,
              reference_number: data.order_number,
              transaction_date: data.order_date || new Date().toISOString(),
              category: 'SALES',
              related_account_name: data.client_name,
            });
            if (bankTxErr) throw bankTxErr;
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
        // Reverse old split bank transactions (immutable ledger — no deletes)
        const { data: oldTxs } = await supabase
          .from('bank_transactions')
          .select('id')
          .eq('reference_number', order.order_number)
          .eq('transaction_type', 'INCOME')
          .eq('is_reversed', false)
          .is('reverses_transaction_id', null);

        for (const t of oldTxs ?? []) {
          const { error: revErr } = await supabase.rpc('reverse_bank_transaction', {
            p_original_id: t.id,
            p_reason: `Sales order ${order.order_number} edited: split→single conversion`,
          });
          if (revErr) throw revErr;
        }

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

      // Guarantee one pending settlement per gateway split (self-heals races/trigger cleanups)
      if (isMultiplePayments && isCompleted) {
        const { error: syncErr } = await supabase.rpc('sync_split_payment_settlements', {
          p_order_id: order.id,
        });
        if (syncErr) throw syncErr;
      }

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

  /* ── Presentation only: derived from the state above, never written back ── */
  const isTerminalOrder = !!order?.order_number?.startsWith('SO-TRM');
  const assetCode = String(products?.find((p) => p.id === formData.product_id)?.code || 'USDT').toUpperCase();
  const remainingIsZero = Math.abs(splitAllocation.remaining) < 0.005;
  // What the order has saved today, shown when the form's choice differs from it.
  const savedWalletName = originalWalletId
    ? wallets?.find((w) => w.id === originalWalletId)?.wallet_name ?? order?.wallet?.wallet_name
    : undefined;
  const walletHint = originalWalletId && formData.warehouse_id !== originalWalletId && savedWalletName
    ? `Saved on the order: ${savedWalletName}`
    : undefined;
  const savedPaymentMethod = originalPaymentMethodId
    ? paymentMethods?.find((m: any) => m.id === originalPaymentMethodId)
    : undefined;
  const paymentMethodHint = !isMultiplePayments && savedPaymentMethod && formData.sales_payment_method_id !== originalPaymentMethodId
    ? `Saved on the order: ${formatPaymentMethodLabel(savedPaymentMethod)}`
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("xl")}>
        <DialogHead
          icon={Edit}
          title="Edit sales order"
          description="For a completed order, changes to amounts, wallet or payment re-post its ledger entries when you save."
          meta={
            <>
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <OrderNo value={order.order_number} className="break-all" />
                <CopyButton value={order.order_number} label="Copy order number" />
              </span>
              {order.is_off_market && <Chip tone="info">Off-market</Chip>}
              {isTerminalOrder && <Chip tone="neutral">Terminal</Chip>}
            </>
          }
        />

        <form onSubmit={handleSubmit} className={DIALOG_FORM}>
          <DialogBody>
            {/* Order */}
            <Section title={<SectionTitle>Order</SectionTitle>}>
              <FieldGrid>
                <Field
                  label="Order date & time"
                  htmlFor="eso-order-date"
                  required={!isTerminalOrder}
                  hint={isTerminalOrder ? "Locked — Terminal-synced orders keep their Binance order date." : undefined}
                >
                  <Input
                    id="eso-order-date"
                    type="datetime-local"
                    value={formData.order_date}
                    onChange={(e) => handleInputChange('order_date', e.target.value)}
                    required
                    disabled={order?.order_number?.startsWith('SO-TRM')}
                  />
                </Field>

                <Field label="Payment status" htmlFor="eso-payment-status">
                  <Select
                    value={formData.payment_status}
                    onValueChange={(value) => handleInputChange('payment_status', value)}
                  >
                    <SelectTrigger id="eso-payment-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGrid>
            </Section>

            {/* Customer */}
            <Section title={<SectionTitle>Customer</SectionTitle>}>
              <div className="space-y-3.5">
                <Field label="Customer name" htmlFor="eso-client-name" required>
                  <Input
                    id="eso-client-name"
                    value={formData.client_name}
                    onChange={(e) => handleInputChange('client_name', e.target.value)}
                    required
                  />
                </Field>

                <FieldGrid>
                  <Field label="Phone" htmlFor="eso-client-phone">
                    <Input
                      id="eso-client-phone"
                      inputMode="tel"
                      value={formData.client_phone}
                      onChange={(e) => handleInputChange('client_phone', e.target.value)}
                      className="tabular-nums"
                    />
                  </Field>

                  <Field label="State" htmlFor="eso-client-state">
                    <Select
                      value={formData.client_state}
                      onValueChange={(value) => handleInputChange('client_state', value)}
                    >
                      <SelectTrigger id="eso-client-state">
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
                  </Field>
                </FieldGrid>
              </div>
            </Section>

            {/* Asset & pricing */}
            <Section title={<SectionTitle>Asset & pricing</SectionTitle>}>
              <div className="space-y-3.5">
                <FieldGrid>
                  <Field label="Product" htmlFor="eso-product">
                    <Select
                      value={formData.product_id}
                      onValueChange={(value) => handleInputChange('product_id', value)}
                    >
                      <SelectTrigger id="eso-product">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}{product.code && product.code !== product.name ? ` (${product.code})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Wallet" htmlFor="eso-wallet" required hint={walletHint}>
                    <Select
                      value={formData.warehouse_id}
                      onValueChange={(value) => handleInputChange('warehouse_id', value)}
                    >
                      <SelectTrigger id="eso-wallet">
                        <SelectValue placeholder="Select wallet" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-[100] max-h-60 overflow-y-auto">
                        {wallets?.map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.wallet_name}{wallet.is_active === false ? ' (Inactive)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGrid>

                <FieldGrid cols={3}>
                  <Field
                    label="Quantity"
                    htmlFor="eso-quantity"
                    required
                    aside={<span className="font-mono text-[11px] font-medium text-muted-foreground">{assetCode}</span>}
                  >
                    <Input
                      id="eso-quantity"
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
                      required
                      min="0"
                      step="0.01"
                      className="tabular-nums"
                    />
                  </Field>

                  <Field label="Price per unit" htmlFor="eso-price-per-unit" required>
                    <RupeeAffix>
                      <Input
                        id="eso-price-per-unit"
                        type="number"
                        value={formData.price_per_unit}
                        onChange={(e) => handleInputChange('price_per_unit', parseFloat(e.target.value) || 0)}
                        required
                        min="0"
                        step="0.01"
                        className="pl-7 tabular-nums"
                      />
                    </RupeeAffix>
                  </Field>

                  <Field label="Total amount" htmlFor="eso-total-amount" hint="Quantity × price per unit">
                    <output
                      id="eso-total-amount"
                      aria-live="polite"
                      className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/50 px-3 text-sm font-semibold tabular-nums text-foreground"
                    >
                      {fmtInr(formData.total_amount)}
                    </output>
                  </Field>
                </FieldGrid>
              </div>
            </Section>

            {/* Payment */}
            <Section title={<SectionTitle>Payment</SectionTitle>}>
              <Field
                label="Payment method"
                htmlFor={isMultiplePayments ? undefined : "eso-payment-method"}
                hint={paymentMethodHint}
                aside={
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
                    <Label htmlFor="edit_split_sales_payment" className="cursor-pointer whitespace-nowrap text-xs font-medium text-muted-foreground">
                      Split payment
                    </Label>
                  </div>
                }
              >
                {!isMultiplePayments ? (
                  <Select
                    value={formData.sales_payment_method_id}
                    onValueChange={(value) => handleInputChange('sales_payment_method_id', value)}
                  >
                    <SelectTrigger id="eso-payment-method">
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
                  /* Split payment distribution: rows of amount + method, running total vs order total */
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="space-y-2 border-b border-border bg-muted/30 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                          {splitAllocation.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
                          )}
                          Payment distribution
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          Allocated <span className="font-semibold text-foreground">{money2(splitAllocation.totalAllocated)}</span> of {money2(totalAmount)}
                        </span>
                      </div>
                      <ShareBar
                        value={splitAllocation.totalAllocated}
                        max={totalAmount}
                        tone={splitAllocation.isValid ? "positive" : "warning"} className="bg-foreground/10"
                        label={`Allocated ${money2(splitAllocation.totalAllocated)} of ${money2(totalAmount)}`}
                      />
                    </div>

                    <div className="space-y-2 p-3">
                      <div className="hidden grid-cols-[9rem_minmax(0,1fr)_2.25rem] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:grid">
                        <span>Amount</span>
                        <span>Payment method</span>
                        <span />
                      </div>

                      {paymentSplits.map((split, index) => (
                        <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_2.25rem]">
                          <RupeeAffix>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={split.amount}
                              onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                              placeholder="0.00"
                              aria-label={`Split ${index + 1} amount`}
                              className="pl-7 tabular-nums"
                            />
                          </RupeeAffix>
                          <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                            <Select
                              value={split.payment_method_id}
                              onValueChange={(value) => updatePaymentSplit(index, 'payment_method_id', value)}
                            >
                              <SelectTrigger aria-label={`Split ${index + 1} payment method`}>
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removePaymentSplit(index)}
                            disabled={paymentSplits.length === 1}
                            className="col-start-2 row-start-1 h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:col-start-3"
                            aria-label={`Remove split ${index + 1}`}
                            title="Remove this payment"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addPaymentSplit}
                        disabled={splitAllocation.remaining <= 0}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4" />
                        {splitAllocation.remaining <= 0 ? 'Fully allocated' : 'Add another payment method'}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-[13px]">
                      <span className="text-muted-foreground">
                        {splitAllocation.remaining < 0 && !remainingIsZero ? "Over-allocated by" : "Remaining"}
                      </span>
                      <span className={cn("font-semibold tabular-nums", splitAllocation.isValid ? "text-success" : "text-destructive")}>
                        {money2(remainingIsZero ? 0 : Math.abs(splitAllocation.remaining))}
                      </span>
                    </div>
                    {remainingIsZero && !splitAllocation.isValid && (
                      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                        Every row needs a payment method and an amount.
                      </p>
                    )}
                  </div>
                )}
              </Field>
            </Section>

            {/* Notes */}
            <Section title={<SectionTitle>Notes</SectionTitle>}>
              <Field label="Description" htmlFor="eso-description">
                <Textarea
                  id="eso-description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                />
              </Field>
            </Section>
          </DialogBody>

          <DialogFoot>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateSalesOrderMutation.isPending}
            >
              {updateSalesOrderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Update order"
              )}
            </Button>
          </DialogFoot>
        </form>
      </DialogContent>
    </Dialog>
  );
}
