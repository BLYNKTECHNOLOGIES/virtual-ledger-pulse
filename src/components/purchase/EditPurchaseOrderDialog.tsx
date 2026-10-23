import { useState, useEffect, useMemo, forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus, CheckCircle2, AlertCircle, Check, Edit, Loader2 } from "lucide-react";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { filterNonAdjustmentBanks } from "@/lib/adjustment-accounts";
import { pickChanged, sameAllocation, sameValue } from "@/lib/order-edit-changes";
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
  SummaryRow,
  dialogContentClass,
} from "@/components/orders-ui";

/* ── Presentation helpers (private; candidates for the orders-ui kit) ───── */

/**
 * Select option whose muted detail (a balance, a status) shows in the open list only;
 * the closed trigger shows just the option's main text.
 */
const DetailSelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { detail?: ReactNode }
>(({ className, children, detail, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center gap-3 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <span className="min-w-0 flex-1 truncate">
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </span>{" "}
    {detail != null && detail !== "" && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{detail}</span>}
  </SelectPrimitive.Item>
));
DetailSelectItem.displayName = "DetailSelectItem";

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

/** "₹62,103.27": two decimals, so money breakdowns line up (display only). */
const money2 = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Bank balance as the original option showed it: "₹2,36,890.75". */
const bankBalance = (account: { balance?: number | string | null }) =>
  `₹${Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

interface ExistingPaymentSplit {
  bank_account_id: string | null;
  amount: number | string | null;
}

interface PurchaseOrderItem {
  id: string;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  warehouse_id?: string | null;
  product_id?: string | null;
  products?: { code?: string | null } | null;
}

interface PurchaseOrder {
  id: string;
  order_number?: string | null;
  supplier_name?: string | null;
  contact_number?: string | null;
  total_amount?: number | string | null;
  order_date?: string | null;
  description?: string | null;
  assigned_to?: string | null;
  tds_applied?: boolean | null;
  tds_amount?: number | string | null;
  net_payable_amount?: number | string | null;
  pan_number?: string | null;
  quantity?: number | string | null;
  price_per_unit?: number | string | null;
  wallet_id?: string | null;
  wallet?: { id?: string | null } | null;
  bank_account_id?: string | null;
  product_id?: string | null;
  status?: string | null;
  is_off_market?: boolean | null;
  purchase_order_items?: PurchaseOrderItem[] | null;
}

interface ReconcilePurchaseOrderResult {
  success?: boolean;
  error?: string;
}

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PurchaseOrder | null;
}

const DECIMAL_INPUT_PATTERN = /^\d*(?:\.\d*)?$/;

const parseDecimalInput = (value: unknown) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!normalized || normalized === '.') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDecimalInput = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

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
  const [quantityInput, setQuantityInput] = useState('');
  const [pricePerUnitInput, setPricePerUnitInput] = useState('');
  // What the form opened with (the saved order): a save changes only what differs from it.
  const [initialForm, setInitialForm] = useState<typeof formData | null>(null);
  const [initialSplits, setInitialSplits] = useState<{ multi: boolean; rows: PaymentSplit[] }>({ multi: false, rows: [] });


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

  // Wallets — active wallets plus this order's wallet (even if deactivated),
  // so the saved wallet always resolves in the dropdown.
  const orderWalletId = order?.wallet_id || order?.wallet?.id || order?.purchase_order_items?.[0]?.warehouse_id || '';
  const { data: walletOptions, isPending: walletOptionsPending } = useQuery({
    queryKey: ['edit_order_wallets', orderWalletId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, is_active')
        .order('wallet_name');
      if (error) throw error;
      return (data || []).filter((w: any) => w.is_active || w.id === orderWalletId);
    },
    enabled: open,
  });


  // Fetch bank accounts
  const { data: bankAccounts, isPending: bankAccountsPending } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return filterNonAdjustmentBanks(data || []);
    },
    enabled: open,
  });

  // Fetch existing payment splits
  const { data: existingSplits, isPending: existingSplitsPending } = useQuery({
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
  const { data: existingWalletCredit, isPending: existingWalletCreditPending } = useQuery({
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

  // The form opens with the order's saved wallet, bank and splits; until they arrive a save could
  // post against data the screen has not shown, so Update waits for them.
  const optionsLoading = walletOptionsPending || bankAccountsPending ||
    (!!order?.id && (existingSplitsPending || existingWalletCreditPending));

  useEffect(() => {
    if (order) {
      const firstItem = order.purchase_order_items?.[0];
      const quantity = parseDecimalInput(firstItem?.quantity ?? order.quantity ?? 0);
      const totalFromOrder = parseDecimalInput(order.total_amount ?? 0);
      const pricePerUnit = parseDecimalInput(firstItem?.unit_price ?? order.price_per_unit ?? (quantity > 0 ? totalFromOrder / quantity : 0));
      const warehouseId = order.wallet_id || order.wallet?.id || firstItem?.warehouse_id || existingWalletCredit || '';
      const productId = firstItem?.product_id || order.product_id || '';


      let tdsOption = 'NO_TDS';
      if (order.tds_applied) {
        const tdsRate = totalFromOrder > 0 ? parseDecimalInput(order.tds_amount) / totalFromOrder : 0;
        if (Math.abs(tdsRate - 0.01) < 0.001) {
          tdsOption = 'TDS_1_PERCENT';
        } else if (Math.abs(tdsRate - 0.20) < 0.001) {
          tdsOption = 'TDS_20_PERCENT';
        }
      }

      const initial = {
        order_number: order.order_number || '',
        supplier_name: order.supplier_name || '',
        contact_number: order.contact_number || '',
        total_amount: totalFromOrder,
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
      };
      setFormData(initial);
      setInitialForm(initial);
      setQuantityInput(toDecimalInput(quantity));
      setPricePerUnitInput(toDecimalInput(pricePerUnit));
    }
  }, [order, existingWalletCredit]);

  // Initialize splits from existing data — also backfill formData if main field is empty
  useEffect(() => {
    if (existingSplits && existingSplits.length > 0) {
      const isMulti = existingSplits.length > 1;
      const rows = (existingSplits as ExistingPaymentSplit[]).map((s) => ({
        bank_account_id: s.bank_account_id || '',
        amount: String(s.amount || ''),
      }));
      setIsMultiplePayments(isMulti);
      setPaymentSplits(rows);
      setInitialSplits({ multi: isMulti, rows });
      // Backfill single-select value from split when main order field is empty
      if (!isMulti && existingSplits.length === 1 && existingSplits[0].bank_account_id) {
        setFormData(prev => prev.bank_account_id
          ? prev
          : { ...prev, bank_account_id: existingSplits[0].bank_account_id }
        );
        setInitialForm(prev => prev && !prev.bank_account_id
          ? { ...prev, bank_account_id: existingSplits[0].bank_account_id }
          : prev
        );
      }
    } else if (order?.bank_account_id) {
      setIsMultiplePayments(false);
      setPaymentSplits([{ 
        bank_account_id: order.bank_account_id, 
        amount: '' 
      }]);
      setInitialSplits({ multi: false, rows: [] });
    } else {
      setIsMultiplePayments(false);
      setPaymentSplits([{ bank_account_id: '', amount: '' }]);
      setInitialSplits({ multi: false, rows: [] });
    }
  }, [existingSplits, order]);

  // Calculate amounts based on TDS option.
  // The saved total, TDS and net payable stay as saved until quantity, price or the TDS option
  // change; then today's arithmetic applies. (Terminal purchases save the gross Binance total with
  // the net-of-fee quantity, so quantity × price is not their total.)
  const quantityPriceChanged = !!initialForm && (
    parseDecimalInput(quantityInput) !== initialForm.quantity ||
    parseDecimalInput(pricePerUnitInput) !== initialForm.price_per_unit
  );
  const amountsChanged = quantityPriceChanged || (!!initialForm && formData.tds_option !== initialForm.tds_option);
  const totalAmount = quantityPriceChanged
    ? parseDecimalInput(quantityInput) * parseDecimalInput(pricePerUnitInput)
    : parseDecimalInput(order?.total_amount);
  const tdsRate = formData.tds_option === "TDS_1_PERCENT" ? 0.01 : formData.tds_option === "TDS_20_PERCENT" ? 0.20 : 0;
  const tdsAmount = amountsChanged ? totalAmount * tdsRate : parseDecimalInput(order?.tds_amount);
  // The amount the order's bank entry was posted with: net payable under TDS, else the total.
  const savedNetPayable = parseDecimalInput(order?.tds_applied && order?.net_payable_amount ? order.net_payable_amount : order?.total_amount);
  const netPayableAmount = amountsChanged ? totalAmount - tdsAmount : savedNetPayable;
  const tdsApplied = amountsChanged ? formData.tds_option !== "NO_TDS" : !!order?.tds_applied;

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

      // What really changed against the saved order (the values the form opened with). Only those
      // are re-posted: a save that changes nothing financial reconciles nothing and rewrites no amount.
      const initial = initialForm ?? data;
      const quantityChanged = data.quantity !== initial.quantity;
      const priceChanged = data.price_per_unit !== initial.price_per_unit;
      const walletChanged = !sameValue(data.warehouse_id, initial.warehouse_id);
      const productChanged = !sameValue(data.product_id, initial.product_id);
      const splitsChanged = isMultiplePayments !== initialSplits.multi || (isMultiplePayments && !sameAllocation(
        paymentSplits.map((s) => ({ id: s.bank_account_id, amount: s.amount })),
        initialSplits.rows.map((s) => ({ id: s.bank_account_id, amount: s.amount })),
      ));
      const bankChanged = splitsChanged || (!isMultiplePayments && !sameValue(data.bank_account_id, initial.bank_account_id));
      const netPayableChanged = netPayableAmount !== savedNetPayable;
      const reconcileNeeded = bankChanged || netPayableChanged || walletChanged || quantityChanged || productChanged;

      // For completed orders, reconcile all dependent records (bank, wallet, fees)
      if (isCompleted && reconcileNeeded) {
        const oldNetPayable = parseDecimalInput(order.tds_applied && order.net_payable_amount
          ? order.net_payable_amount
          : order.total_amount);

        const oldQuantity = parseDecimalInput(order.purchase_order_items?.[0]?.quantity ?? order.quantity ?? 0);
        const oldWalletId = order.wallet_id || order.wallet?.id || order.purchase_order_items?.[0]?.warehouse_id || null;

        // Get wallet fee percentage
        let feePercentage = 0;
        const isOffMarket = order.is_off_market || false;
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
        if (data.product_id) {
          const { data: selectedProd } = await supabase.from('products').select('code').eq('id', data.product_id).single();
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
          // An unchanged bank or wallet goes in as old = new, so the reconcile re-posts only real changes.
          p_old_bank_account_id: bankChanged ? order.bank_account_id || null : (isMultiplePayments ? null : selectedBankId),
          p_new_bank_account_id: isMultiplePayments ? null : selectedBankId,
          p_old_net_payable: oldNetPayable,
          p_new_net_payable: netPayableAmount,
          p_old_wallet_id: walletChanged ? oldWalletId : data.warehouse_id || null,
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

        const result = reconcileResult as ReconcilePurchaseOrderResult | null;
        if (result && !result.success) {
          throw new Error(result.error || 'Reconciliation failed');
        }

        
      }

      const { data: result, error } = await supabase
        .from('purchase_orders')
        .update({
          // Only the columns whose value changed, so an unchanged amount is never rewritten and no
          // trigger (TDS rebuild) acts on a value that did not change.
          ...pickChanged({
            order_number: data.order_number,
            supplier_name: data.supplier_name,
            contact_number: data.contact_number,
            order_date: data.order_date,
            description: data.description,
            assigned_to: data.assigned_to,
            pan_number: data.pan_number,
            ...(amountsChanged ? {
              total_amount: totalAmount,
              tds_applied: tdsApplied,
              tds_amount: tdsAmount,
              net_payable_amount: netPayableAmount,
              total_paid: netPayableAmount,
            } : {}),
            ...(quantityChanged ? { quantity: data.quantity } : {}),
            ...(priceChanged ? { price_per_unit: data.price_per_unit } : {}),
            ...(walletChanged ? { wallet_id: data.warehouse_id || null } : {}),
            ...(bankChanged ? { bank_account_id: selectedBankId } : {}),
          }, order),
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .select()
        .single();

      if (error) throw error;

      // Update purchase order items if they exist (only what changed; the item total follows quantity × price)
      if (order.purchase_order_items?.length > 0) {
        const firstItem = order.purchase_order_items[0];
        const itemChanges = pickChanged({
          ...(quantityChanged ? { quantity: data.quantity } : {}),
          ...(priceChanged ? { unit_price: data.price_per_unit } : {}),
          ...(quantityChanged || priceChanged ? { total_price: totalAmount } : {}),
          ...(walletChanged ? { warehouse_id: data.warehouse_id || null } : {}),
          ...(productChanged ? { product_id: data.product_id || null } : {}),
        }, firstItem);
        if (Object.keys(itemChanges).length > 0) {
          await supabase
            .from('purchase_order_items')
            .update(itemChanges)
            .eq('id', firstItem.id);
        }
      }

      // The effective USDT valuation is built from quantity, total and product: re-run it only when one changed.
      if (isCompleted && (quantityChanged || priceChanged || productChanged)) {
        const { data: valuationResult, error: valuationError } = await supabase.rpc(
          'recalculate_purchase_order_effective_usdt' as never,
          {
            p_order_id: order.id,
            p_reason: 'Completed purchase order edited from Edit Purchase Order dialog',
          } as never,
        );

        const valuation = valuationResult as ReconcilePurchaseOrderResult | null;
        if (valuationError || (valuation && valuation.success === false)) {
          throw new Error(valuationError?.message || valuation?.error || 'Failed to recalculate effective USDT valuation');
        }
      }

      // Payment splits are now handled inside the reconcile_purchase_order_edit RPC
      // (SECURITY DEFINER) to prevent silent RLS failures causing duplicate accumulation

      // ── TDS CASCADING UPDATES ──
      // When TDS details change, update all dependent records
      const oldTdsApplied = !!order.tds_applied;
      const oldPanNumber = order.pan_number || '';
      const oldTdsAmount = parseDecimalInput(order.tds_amount);
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
      queryClient.invalidateQueries({ queryKey: ['period_based_pl_dashboard_v2'] });
      queryClient.invalidateQueries({ queryKey: ['average_cost_calculation'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['counterparty-pan-records'] });
      queryClient.invalidateQueries({ queryKey: ['tds-records'] });
      queryClient.invalidateQueries({ queryKey: ['client-tds-records'] });
      queryClient.invalidateQueries({ queryKey: ['tax-management'] });
      // Also invalidate activity timeline so the new edit shows immediately
      queryClient.invalidateQueries({ queryKey: ['activity_timeline'] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update purchase order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (optionsLoading) return;

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

    const quantity = parseDecimalInput(quantityInput);
    const pricePerUnit = parseDecimalInput(pricePerUnitInput);

    if (quantity <= 0 || pricePerUnit <= 0) {
      toast({ title: "Error", description: "Quantity and price per unit must be greater than 0", variant: "destructive" });
      return;
    }

    updatePurchaseOrderMutation.mutate({
      ...formData,
      quantity,
      price_per_unit: pricePerUnit,
      total_amount: quantity * pricePerUnit,
    });
  };

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDecimalInputChange = (field: 'quantity' | 'price_per_unit', value: string) => {
    const normalizedValue = value.replace(/,/g, '').trim();
    if (!DECIMAL_INPUT_PATTERN.test(normalizedValue)) return;

    if (field === 'quantity') setQuantityInput(normalizedValue);
    else setPricePerUnitInput(normalizedValue);

    setFormData(prev => ({
      ...prev,
      [field]: parseDecimalInput(normalizedValue),
    }));
  };

  if (!order) return null;

  /* ── Presentation only (derived from the state above) ───────────────── */
  const assetCode = products?.find((p) => p.id === formData.product_id)?.code || '';
  const tdsRateLabel = formData.tds_option === "TDS_1_PERCENT" ? "1%" : "20%";
  const remainingIsZero = Math.abs(splitAllocation.remaining) < 0.005;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("xl")}>
        <DialogHead
          icon={Edit}
          title="Edit purchase order"
          description="For a completed order, changes to amounts, TDS, product, wallet or bank re-post its ledger entries when you save."
          meta={
            <>
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <OrderNo value={order.order_number} className="break-all" />
                <CopyButton value={order.order_number} label="Copy order number" />
              </span>
              {order.is_off_market && <Chip tone="info">Off-market</Chip>}
            </>
          }
        />

        <form onSubmit={handleSubmit} className={DIALOG_FORM}>
          <DialogBody>
            {/* Order */}
            <Section title="Order">
              <FieldGrid>
                <Field label="Order date" htmlFor="edit_order_date" required>
                  <Input
                    id="edit_order_date"
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => handleInputChange('order_date', e.target.value)}
                    required
                  />
                </Field>
              </FieldGrid>
            </Section>

            {/* Seller */}
            <Section title="Seller">
              <FieldGrid>
                <Field label="Seller name" htmlFor="edit_supplier_name" required>
                  <Input
                    id="edit_supplier_name"
                    value={formData.supplier_name}
                    onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                    required
                  />
                </Field>

                <Field label="Contact number" htmlFor="edit_contact_number">
                  <Input
                    id="edit_contact_number"
                    value={formData.contact_number}
                    onChange={(e) => handleInputChange('contact_number', e.target.value)}
                    className="tabular-nums"
                  />
                </Field>
              </FieldGrid>
            </Section>

            {/* Asset & pricing */}
            <Section title="Asset & pricing">
              <div className="space-y-3.5">
                <FieldGrid>
                  <Field label="Product" htmlFor="edit_product_id" required>
                    {/* The product, wallet and bank selects have no empty option: an empty value is Radix
                        reporting a saved value whose option has not loaded yet, never a choice, so it is ignored. */}
                    <Select
                      value={formData.product_id}
                      onValueChange={(value) => { if (value) handleInputChange('product_id', value); }}
                    >
                      <SelectTrigger id="edit_product_id">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.map((product) => (
                          <DetailSelectItem
                            key={product.id}
                            value={product.id}
                            detail={product.code && product.code !== product.name ? product.code : undefined}
                          >
                            {product.name}
                          </DetailSelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGrid>

                <FieldGrid cols={3}>
                  <Field
                    label="Quantity"
                    htmlFor="edit_quantity"
                    required
                    aside={assetCode ? <span className="font-mono text-[11px] font-medium text-muted-foreground">{assetCode}</span> : undefined}
                  >
                    <Input
                      id="edit_quantity"
                      type="text"
                      inputMode="decimal"
                      value={quantityInput}
                      onChange={(e) => handleDecimalInputChange('quantity', e.target.value)}
                      required
                      className="tabular-nums"
                    />
                  </Field>

                  <Field label="Price per unit" htmlFor="edit_price_per_unit" required>
                    <RupeeAffix>
                      <Input
                        id="edit_price_per_unit"
                        type="text"
                        inputMode="decimal"
                        value={pricePerUnitInput}
                        onChange={(e) => handleDecimalInputChange('price_per_unit', e.target.value)}
                        required
                        className="pl-7 tabular-nums"
                      />
                    </RupeeAffix>
                  </Field>

                  <Field label="Total amount" htmlFor="edit_total_amount" hint={quantityPriceChanged ? "Quantity × price per unit" : "Saved on the order"}>
                    <output
                      id="edit_total_amount"
                      aria-live="polite"
                      className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/50 px-3 text-sm font-semibold tabular-nums text-foreground"
                    >
                      {money2(totalAmount)}
                    </output>
                  </Field>
                </FieldGrid>
              </div>
            </Section>

            {/* Wallet & bank */}
            <Section title="Wallet & bank">
              <FieldGrid>
                <Field label="Wallet" htmlFor="edit_wallet_id" required>
                  <Select
                    value={formData.warehouse_id}
                    onValueChange={(value) => { if (value) handleInputChange('warehouse_id', value); }}
                  >
                    <SelectTrigger id="edit_wallet_id">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {walletOptions?.map((wallet: any) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.wallet_name}{wallet.is_active === false ? ' (Inactive)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Bank account"
                  htmlFor={isMultiplePayments ? undefined : "edit_bank_account_id"}
                  className={isMultiplePayments ? "sm:col-span-2" : undefined}
                  aside={
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
                      <Label htmlFor="edit_split_payment" className="cursor-pointer whitespace-nowrap text-xs font-medium text-muted-foreground">
                        Split payment
                      </Label>
                    </div>
                  }
                >
                  {!isMultiplePayments ? (
                    <Select
                      value={formData.bank_account_id}
                      onValueChange={(value) => { if (value) handleInputChange('bank_account_id', value); }}
                    >
                      <SelectTrigger id="edit_bank_account_id">
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts?.map((account) => (
                          <DetailSelectItem key={account.id} value={account.id} detail={bankBalance(account)}>
                            {account.account_name}
                          </DetailSelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    /* Split payment: rows of amount + bank, running total vs net payable */
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
                            Allocated <span className="font-semibold text-foreground">{money2(splitAllocation.totalAllocated)}</span> of {money2(netPayableAmount)} net payable
                          </span>
                        </div>
                        <ShareBar
                          value={splitAllocation.totalAllocated}
                          max={netPayableAmount}
                          tone={splitAllocation.isValid ? "positive" : "warning"} className="bg-foreground/10"
                          label={`Allocated ${money2(splitAllocation.totalAllocated)} of ${money2(netPayableAmount)}`}
                        />
                      </div>

                      <div className="space-y-2 p-3">
                        <div className="hidden grid-cols-[9rem_minmax(0,1fr)_2.25rem] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:grid">
                          <span>Amount</span>
                          <span>Bank account</span>
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
                                value={split.bank_account_id}
                                onValueChange={(value) => { if (value) updatePaymentSplit(index, 'bank_account_id', value); }}
                              >
                                <SelectTrigger aria-label={`Split ${index + 1} bank account`}>
                                  <SelectValue placeholder="Select bank account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {bankAccounts?.map((account) => (
                                    <DetailSelectItem key={account.id} value={account.id} detail={bankBalance(account)}>
                                      {account.account_name}
                                    </DetailSelectItem>
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
                              title="Remove this bank"
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
                          {splitAllocation.remaining <= 0 ? 'Fully allocated' : 'Add another bank'}
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
                          Every row needs a bank account and an amount.
                        </p>
                      )}
                    </div>
                  )}
                </Field>
              </FieldGrid>
            </Section>

            {/* Tax */}
            <Section title="Tax">
              <div className="space-y-3.5">
                <FieldGrid>
                  <Field label="TDS" htmlFor="edit_tds_option">
                    <Select
                      value={formData.tds_option}
                      onValueChange={(value) => handleInputChange('tds_option', value)}
                    >
                      <SelectTrigger id="edit_tds_option">
                        <SelectValue placeholder="Select TDS option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NO_TDS">No TDS</SelectItem>
                        <SelectItem value="TDS_1_PERCENT">1% TDS (with PAN)</SelectItem>
                        <SelectItem value="TDS_20_PERCENT">20% TDS (without PAN)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {formData.tds_option === "TDS_1_PERCENT" && (
                    <Field label="PAN number" htmlFor="edit_pan_number" required>
                      <Input
                        id="edit_pan_number"
                        value={formData.pan_number}
                        onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                        placeholder="Enter PAN number"
                        required
                        className="font-mono placeholder:font-sans"
                      />
                    </Field>
                  )}
                </FieldGrid>

                {formData.tds_option !== "NO_TDS" && (
                  <div className="rounded-lg border border-border px-3 py-1 sm:px-4">
                    <SummaryRow label="Order amount" value={money2(totalAmount)} />
                    <SummaryRow label={`TDS (${tdsRateLabel})`} value={`−${money2(tdsAmount)}`} />
                    <SummaryRow label="Net payable" value={money2(netPayableAmount)} strong />
                  </div>
                )}
              </div>
            </Section>

            {/* Notes */}
            <Section title="Notes">
              <Field label="Description" htmlFor="edit_description">
                <Textarea
                  id="edit_description"
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
            <Button type="submit" disabled={updatePurchaseOrderMutation.isPending || optionsLoading}>
              {updatePurchaseOrderMutation.isPending ? (
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
