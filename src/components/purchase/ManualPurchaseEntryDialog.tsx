import React, { useState, useMemo, useEffect, forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { useTriFieldCalc } from "@/hooks/useTriFieldCalc";
import { useQuickAction } from "@/hooks/useQuickAction";
import { fetchAndLockMarketRate, linkSnapshotToReference } from "@/lib/effectiveUsdtEngine";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Loader2, Plus, Minus, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SupplierAutocomplete } from "./SupplierAutocomplete";
import { createSellerClient } from "@/utils/clientIdGenerator";
import { recordActionTiming } from "@/lib/purchase-action-timing";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, requireCurrentUserId } from "@/lib/system-action-logger";
import { Checkbox } from "@/components/ui/checkbox";
import { getLastOrderDefaults, saveLastOrderDefaults } from "@/utils/orderDefaults";
import { updateClientFromOrder } from "@/utils/updateClientFromOrder";
import { filterNonAdjustmentBanks } from "@/lib/adjustment-accounts";
import { cn } from "@/lib/utils";
import { ShareBar } from "@/components/finance-ui/primitives";
import {
  Chip,
  DIALOG_FORM,
  DialogBody,
  DialogFoot,
  DialogHead,
  Field,
  FieldGrid,
  Section,
  SummaryRow,
  ToggleRow,
  dialogContentClass,
  fmtAssetQty,
  fmtInr,
  fmtQty,
} from "@/components/orders-ui";

/* ── Presentation helpers (private; candidates for the orders-ui kit) ───── */

/**
 * Select option whose muted detail (a balance, a chain, stock) shows in the open list only;
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

/** "₹24,962.50": two decimals, so money breakdowns line up (display only). */
const money2 = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Bank balance as the original option showed it: "₹2,36,890.75". */
const bankBalance = (account: { balance?: number | string | null }) =>
  `₹${Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

interface ManualPurchaseEntryDialogProps {
  onSuccess?: () => void;
}

export const ManualPurchaseEntryDialog: React.FC<ManualPurchaseEntryDialogProps> = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  // Alt+Shift+N opens this dialog. The trigger button is already permission-gated
  // on the Purchase page, so this only opens the same dialog the user can open.
  useQuickAction('new', () => setOpen(true));
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [isGeneratingOrderNumber, setIsGeneratingOrderNumber] = useState(false);
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);
  const { handleFieldChange: calcTriField, resetManualFlags } = useTriFieldCalc();
  const [selectedClientBankDetails, setSelectedClientBankDetails] = useState<{
    pan_card_number?: string | null;
    linked_bank_accounts?: Array<{
      account_name?: string;
      account_number?: string;
      bank_name?: string;
      ifsc_code?: string;
    }> | null;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState(() => {
    const lastDefaults = getLastOrderDefaults('purchase');
    return {
      order_number: '',
      supplier_name: '',
      order_date: new Date().toISOString().split('T')[0],
      description: '',
      product_id: lastDefaults.product_id || '',
      quantity: '',
      price_per_unit: lastDefaults.price_per_unit || '',
      total_amount: '',
      contact_number: '',
      deduction_bank_account_id: '',
      credit_wallet_id: lastDefaults.wallet_id || '',
      tds_option: 'none' as 'none' | '1%' | '20%',
      pan_number: '',
      fee_percentage: '',
      is_off_market: false
    };
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
      return filterNonAdjustmentBanks(data || []);
    }
  });

  // Fetch products
  const { data: products, isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*');
      
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  // Fetch active wallets with detailed info
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
    }
  });

  // Selected product
  const selectedProduct = useMemo(() => 
    products?.find(p => p.id === formData.product_id),
    [products, formData.product_id]
  );

  // Selected wallet
  const selectedWallet = useMemo(() => 
    wallets?.find(w => w.id === formData.credit_wallet_id),
    [wallets, formData.credit_wallet_id]
  );

  // Auto-fill fee_percentage from wallet when pre-filled from defaults
  useEffect(() => {
    if (selectedWallet && !formData.fee_percentage) {
      if (selectedWallet.is_fee_enabled && selectedWallet.fee_percentage) {
        setFormData(prev => ({ ...prev, fee_percentage: selectedWallet.fee_percentage.toString() }));
      }
    }
  }, [selectedWallet]);

  // Calculate TDS amount
  const tdsCalculation = useMemo(() => {
    const totalAmount = parseFloat(formData.total_amount) || 0;
    let tdsRate = 0;
    
    if (formData.tds_option === '1%') tdsRate = 1;
    else if (formData.tds_option === '20%') tdsRate = 20;
    
    const tdsAmount = totalAmount * (tdsRate / 100);
    const netPayable = totalAmount - tdsAmount;
    
    return { tdsRate, tdsAmount, netPayable };
  }, [formData.total_amount, formData.tds_option]);

  // Calculate platform fee amount
  const feeCalculation = useMemo(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const feePercentage = parseFloat(formData.fee_percentage) || 0;
    
    if (formData.is_off_market || feePercentage <= 0) {
      return { feeAmount: 0, netCredit: quantity };
    }
    
    const feeAmount = quantity * (feePercentage / 100);
    const netCredit = quantity - feeAmount;
    
    return { feeAmount, netCredit };
  }, [formData.quantity, formData.fee_percentage, formData.is_off_market]);

  // Calculate payment split allocation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) => 
      sum + (parseFloat(s.amount) || 0), 0);
    const remaining = tdsCalculation.netPayable - totalAllocated;
    const isValid = Math.abs(remaining) <= 0.01 && paymentSplits.every(s => s.bank_account_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, tdsCalculation.netPayable]);

  // Helper functions for payment splits
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

  // Auto-fill first split amount when net payable changes (for single split convenience)
  useEffect(() => {
    if (isMultiplePayments && paymentSplits.length === 1 && tdsCalculation.netPayable > 0) {
      const currentAmount = parseFloat(paymentSplits[0].amount) || 0;
      if (currentAmount === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: tdsCalculation.netPayable.toFixed(2) }]);
      }
    }
  }, [isMultiplePayments, tdsCalculation.netPayable]);

  // Auto-fill PAN when TDS option changes to 1% and existing client with PAN is selected
  useEffect(() => {
    if (
      formData.tds_option === '1%' && 
      selectedClientId && 
      selectedClientBankDetails?.pan_card_number &&
      !formData.pan_number // Only auto-fill if PAN field is empty
    ) {
      setFormData(prev => ({
        ...prev,
        pan_number: selectedClientBankDetails.pan_card_number || ''
      }));
    }
  }, [formData.tds_option, selectedClientId, selectedClientBankDetails]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Bidirectional auto-calculation using useTriFieldCalc:
      // Tracks whether total was manually entered to prevent cascading recalculations
      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const calcField = field === 'price_per_unit' ? 'price' : field === 'total_amount' ? 'total' : 'quantity';
        const result = calcTriField(calcField, String(value), {
          quantity: String(prev.quantity),
          price: String(prev.price_per_unit),
          total: String(prev.total_amount),
        });
        if (field !== 'quantity') updated.quantity = result.quantity;
        if (field !== 'price_per_unit') updated.price_per_unit = result.price;
        if (field !== 'total_amount') updated.total_amount = result.total;
      }

      // Auto-populate wallet fee percentage when wallet is selected
      if (field === 'credit_wallet_id' && value) {
        const wallet = wallets?.find(w => w.id === value);
        if (wallet?.is_fee_enabled && wallet?.fee_percentage) {
          updated.fee_percentage = wallet.fee_percentage.toString();
        }
      }
      
      return updated;
    });
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now();
    return `MPE-${timestamp}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against double submission
    if (loading) {
      return;
    }
    
    setLoading(true);

    try {
      // Validate required fields
      const missingFields = [];
      if (!formData.supplier_name) missingFields.push('supplier_name');
      if (!formData.quantity) missingFields.push('quantity');
      if (!formData.price_per_unit) missingFields.push('price_per_unit');
      if (!formData.product_id) missingFields.push('product_id');
      if (!formData.credit_wallet_id) missingFields.push('credit_wallet_id');
      
      // Validate bank account based on payment mode
      if (isMultiplePayments) {
        // Validate split payments
        if (!splitAllocation.isValid) {
          toast({
            title: "Error",
            description: `Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)} (must be ₹0.00)`,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
        // Check for duplicate banks
        const bankIds = paymentSplits.map(s => s.bank_account_id);
        const uniqueBankIds = new Set(bankIds);
        if (uniqueBankIds.size !== bankIds.length) {
          toast({
            title: "Error",
            description: "Each bank account can only be used once in split payments",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
      } else {
        if (!formData.deduction_bank_account_id) missingFields.push('deduction_bank_account_id');
      }
      
      if (missingFields.length > 0) {
        
        toast({
          title: "Error",
          description: `Missing required fields: ${missingFields.join(', ')}`,
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Validate PAN for 1% TDS
      if (formData.tds_option === '1%') {
        if (!formData.pan_number || formData.pan_number.trim() === '') {
          
          toast({
            title: "Error",
            description: "PAN number is required for 1% TDS deduction",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.pan_number.trim())) {
          toast({
            title: "Invalid PAN Format",
            description: "PAN must be in format AAAAA9999A (e.g. ABCDE1234F)",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
      }

      // For off-market orders, generate the actual order number now (consuming the sequence)
      // For regular orders, use the form value or auto-generate
      let orderNumber: string;
      if (formData.is_off_market) {
        const { data: offMarketNumber, error: offMarketError } = await supabase.rpc('generate_off_market_purchase_order_number');
        if (offMarketError || !offMarketNumber) {
          throw new Error('Failed to generate off-market order number');
        }
        orderNumber = offMarketNumber;
      } else {
        orderNumber = formData.order_number || generateOrderNumber();
      }
      const totalAmount = parseFloat(formData.total_amount) || 0;
      

      // Get current user ID for created_by tracking — REQUIRED, blocks if missing
      const currentUserId = await requireCurrentUserId();

      let result: Record<string, unknown>;
      let functionError: Error | null = null;

      if (isMultiplePayments && paymentSplits.length > 0) {
        // Use split payments RPC
        const splitPaymentsJson = paymentSplits.map(s => ({
          bank_account_id: s.bank_account_id,
          amount: parseFloat(s.amount)
        }));

        const rpcParams = {
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
          p_payment_splits: splitPaymentsJson
        };
        
        const { data, error } = await supabase.rpc(
          'create_manual_purchase_with_split_payments_rpc' as any,
          rpcParams
        );
        result = data as Record<string, unknown>;
        functionError = error;
      } else {
        // Use standard single-payment RPC
        const rpcParams = {
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
          p_created_by: currentUserId || undefined
        };
        
        const { data, error } = await supabase.rpc(
          'create_manual_purchase_complete_v2_rpc' as any,
          rpcParams
        );
        result = data as Record<string, unknown>;
        functionError = error;
      }

      if (functionError) {
        throw functionError;
      }

      // The RPC returns a JSON object even on failure; treat success:false as an error.
      if (result && typeof result === 'object' && 'success' in (result as Record<string, unknown>)) {
        const ok = Boolean((result as Record<string, unknown>).success);
        if (!ok) {
          const errMsg = String((result as Record<string, unknown>).error || 'Unknown error');
          throw new Error(errMsg);
        }
      }

      // Verify purchase order was created and is readable before proceeding
      if (!result || typeof result !== 'object' || !('purchase_order_id' in (result as Record<string, unknown>))) {
        throw new Error('Purchase order was not created properly - no order ID returned');
      }

      const orderId = (result as Record<string, unknown>).purchase_order_id as string;

      // Store market_rate_usdt (CoinUSDT rate at purchase time)
      const selectedProductCode = selectedProduct?.code?.toUpperCase() || 'USDT';
      const locked = await fetchAndLockMarketRate(selectedProductCode, {
        entryType: 'manual_purchase',
        referenceId: orderId,
        referenceType: 'purchase_order',
      });
      const marketRateUsdt = locked.price;
      {
        const mpEffRate = marketRateUsdt > 0 ? marketRateUsdt : 1;
        const mpQty = parseFloat(formData.quantity) || 0;
        const mpTotalAmt = totalAmount;
        const mpEffUsdtQty = mpQty * mpEffRate;
        const mpEffUsdtRate = mpEffUsdtQty > 0 ? mpTotalAmt / mpEffUsdtQty : null;

        await supabase
          .from('purchase_orders')
          .update({
            market_rate_usdt: marketRateUsdt > 0 ? marketRateUsdt : null,
            effective_usdt_qty: mpEffUsdtQty,
            effective_usdt_rate: mpEffUsdtRate,
          })
          .eq('id', orderId);
      }

      // Verify the purchase order is readable (RLS check)
      const { data: verifiedOrder, error: verifyError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('id', orderId)
        .single();

      if (verifyError || !verifiedOrder) {
        console.error('Purchase order verification failed:', verifyError);
        throw new Error('Purchase order created but not readable - check RLS policies');
      }

      // ONLY create seller client AFTER purchase order is successfully created and verified
      if (isNewClient && formData.supplier_name.trim()) {
        try {
          const newClient = await createSellerClient(
            formData.supplier_name.trim(),
            formData.contact_number || undefined
          );
          if (newClient) {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['pending-seller-approvals'] });
          }
        } catch (clientError) {
          // Log but don't fail - purchase order was already created
          console.warn('Failed to create seller client, but purchase order succeeded:', clientError);
        }
      }

      // If an existing client is linked, update their profile with any new contact/state info
      if (!isNewClient && selectedClientId && formData.contact_number) {
        await updateClientFromOrder({
          clientId: selectedClientId,
          phone: formData.contact_number || null,
        });
      }

      // Record timing for manual entry - result contains the purchase order id
      await recordActionTiming(orderId, 'manual_entry_created', 'purchase_creator');
      await recordActionTiming(orderId, 'order_created', 'purchase_creator');
      
      // Log actions for audit trail
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_MANUAL_ENTRY_CREATED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: orderId,
        module: Modules.PURCHASE,
        metadata: { order_number: orderNumber }
      });
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_ORDER_CREATED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: orderId,
        module: Modules.PURCHASE,
        metadata: { order_number: orderNumber, is_manual_entry: true }
      });

      // Build success message with details
      let successMessage = `Purchase order ${orderNumber} created successfully!`;
      if (tdsCalculation.tdsRate > 0) {
        successMessage += ` TDS of ₹${tdsCalculation.tdsAmount.toFixed(2)} (${tdsCalculation.tdsRate}%) recorded.`;
      }
      if (feeCalculation.feeAmount > 0 && !formData.is_off_market) {
        successMessage += ` Platform fee of ${feeCalculation.feeAmount.toFixed(4)} USDT applied.`;
      }
      if (isMultiplePayments && paymentSplits.length > 1) {
        successMessage += ` Payment split across ${paymentSplits.length} bank accounts.`;
      }

      toast({
        title: "Success",
        description: successMessage
      });

      // Save last used defaults for next order
      saveLastOrderDefaults({
        wallet_id: formData.credit_wallet_id,
        product_id: formData.product_id,
        price_per_unit: formData.price_per_unit,
      }, 'purchase');

      // Reset form with saved defaults pre-filled
      const nextDefaults = getLastOrderDefaults('purchase');
      setFormData({
        order_number: '',
        supplier_name: '',
        order_date: new Date().toISOString().split('T')[0],
        description: '',
        product_id: nextDefaults.product_id || '',
        quantity: '',
        price_per_unit: nextDefaults.price_per_unit || '',
        total_amount: '',
        contact_number: '',
        deduction_bank_account_id: '',
        credit_wallet_id: nextDefaults.wallet_id || '',
        tds_option: 'none',
        pan_number: '',
        fee_percentage: '',
        is_off_market: false
      });
      setSelectedClientId('');
      setIsNewClient(false);
      setSelectedClientBankDetails(null);
      setIsMultiplePayments(false);
      setPaymentSplits([{ bank_account_id: '', amount: '' }]);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['tds-records'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });

      // Save last used defaults
      saveLastOrderDefaults({
        wallet_id: formData.credit_wallet_id,
        product_id: formData.product_id,
        price_per_unit: formData.price_per_unit,
      }, 'purchase');

      setOpen(false);
      onSuccess?.();

    } catch (error: any) {
      console.error('ManualPurchase: Error creating purchase order:', error);
      toast({
        title: "Error",
        description: `Failed to create purchase order: ${error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  /* ── Presentation only (derived from the state above) ───────────────── */
  const showSummary = parseFloat(formData.total_amount) > 0;
  const showTdsBreakdown = tdsCalculation.tdsRate > 0 && parseFloat(formData.total_amount) > 0;
  const showFeeBreakdown = feeCalculation.feeAmount > 0 && parseFloat(formData.quantity) > 0;
  const hasSplitAmounts = isMultiplePayments && paymentSplits.some(s => parseFloat(s.amount) > 0);
  const assetCode = selectedProduct?.code || '';
  // The original fee preview always said "USDT"; it now names the selected product (USDT when none).
  const feeAsset = selectedProduct?.code || 'USDT';
  const remainingIsZero = Math.abs(splitAllocation.remaining) < 0.005;
  const totalForNote = parseFloat(formData.total_amount) || 0;
  const quantityForNote = parseFloat(formData.quantity) || 0;
  const footNote = [totalForNote > 0 ? fmtInr(totalForNote) : null, quantityForNote > 0 ? fmtAssetQty(quantityForNote, assetCode) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="whitespace-nowrap">Manual entry</span>
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogContentClass("xxl")}>
        <DialogHead
          icon={ShoppingCart}
          title="Manual purchase entry"
          description="Direct ledger entry — bypasses all workflow, timers and notifications."
          meta={
            formData.is_off_market || isMultiplePayments ? (
              <>
                {formData.is_off_market && <Chip tone="info">Off-market</Chip>}
                {isMultiplePayments && <Chip tone="neutral">Split payment</Chip>}
              </>
            ) : undefined
          }
        />

        <form onSubmit={handleSubmit} className={DIALOG_FORM}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="min-w-0 space-y-6">
                {/* Order */}
                <Section title="Order">
                  <FieldGrid>
                    <Field
                      label="Order number"
                      htmlFor="order_number"
                      hint={formData.is_off_market ? "Preview — the final OFP number is assigned when the order is created." : undefined}
                    >
                      <div className="relative">
                        <Input
                          id="order_number"
                          autoFocus
                          value={formData.order_number}
                          onChange={(e) => handleInputChange('order_number', e.target.value)}
                          placeholder={isGeneratingOrderNumber ? "Generating..." : formData.is_off_market ? "Auto-generated" : "Auto-generated if empty"}
                          disabled={formData.is_off_market || isGeneratingOrderNumber}
                          className={cn(
                            "font-mono placeholder:font-sans",
                            formData.is_off_market && "bg-muted disabled:opacity-100",
                            isGeneratingOrderNumber && "pr-9",
                          )}
                        />
                        {isGeneratingOrderNumber && (
                          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
                        )}
                      </div>
                    </Field>

                    <Field label="Order date" htmlFor="order_date">
                      <Input
                        id="order_date"
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => handleInputChange('order_date', e.target.value)}
                      />
                    </Field>
                  </FieldGrid>
                </Section>

                {/* Seller */}
                <Section title="Seller">
                  <FieldGrid>
                    <Field label="Seller name" htmlFor="sellerName" required>
                      <SupplierAutocomplete
                        hideLabel
                        value={formData.supplier_name}
                        onChange={(value) => handleInputChange('supplier_name', value)}
                        onContactChange={(contact) => handleInputChange('contact_number', contact)}
                        onClientSelect={(clientId, clientName, bankDetails) => {
                          setSelectedClientId(clientId);
                          setSelectedClientBankDetails(bankDetails || null);
                          handleInputChange('supplier_name', clientName);

                          // Auto-fill PAN if client has one and TDS is 1%
                          if (bankDetails?.pan_card_number && formData.tds_option === '1%') {
                            handleInputChange('pan_number', bankDetails.pan_card_number);
                          }
                        }}
                        onNewClient={(isNew) => {
                          setIsNewClient(isNew);
                          if (isNew) {
                            setSelectedClientBankDetails(null);
                          }
                        }}
                        selectedClientId={selectedClientId}
                      />
                    </Field>

                    <Field label="Contact number" htmlFor="contact_number">
                      <Input
                        id="contact_number"
                        value={formData.contact_number}
                        onChange={(e) => handleInputChange('contact_number', e.target.value)}
                        placeholder="Enter contact number"
                        className="tabular-nums"
                      />
                    </Field>
                  </FieldGrid>
                </Section>

                {/* Asset & pricing */}
                <Section title="Asset & pricing">
                  <div className="space-y-3.5">
                    <FieldGrid>
                      <Field label="Product" htmlFor="product_id" required>
                        <Select
                          value={formData.product_id}
                          onValueChange={(value) => handleInputChange('product_id', value)}
                        >
                          <SelectTrigger id="product_id">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent className="z-[60]">
                            {productsLoading ? (
                              <SelectItem value="loading" disabled>Loading products...</SelectItem>
                            ) : productsError ? (
                              <SelectItem value="error" disabled>Error loading products</SelectItem>
                            ) : !products || products.length === 0 ? (
                              <SelectItem value="empty" disabled>No products found</SelectItem>
                            ) : (
                              products.map((product) => (
                                <DetailSelectItem
                                  key={product.id}
                                  value={product.id}
                                  detail={[
                                    product.code && product.code !== product.name ? product.code : null,
                                    `Stock ${fmtQty(product.current_stock_quantity)}`,
                                  ].filter(Boolean).join(" · ")}
                                >
                                  {product.name}
                                </DetailSelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGrid>

                    <FieldGrid cols={3}>
                      <Field label="Total amount" htmlFor="total_amount">
                        <RupeeAffix>
                          <Input
                            id="total_amount"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={formData.total_amount}
                            onChange={(e) => handleInputChange('total_amount', e.target.value)}
                            placeholder="0"
                            className="pl-7 tabular-nums"
                          />
                        </RupeeAffix>
                      </Field>

                      <Field label="Price per unit" htmlFor="price_per_unit" required>
                        <RupeeAffix>
                          <Input
                            id="price_per_unit"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={formData.price_per_unit}
                            onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                            placeholder="0.00"
                            required
                            className="pl-7 tabular-nums"
                          />
                        </RupeeAffix>
                      </Field>

                      <Field
                        label="Quantity"
                        htmlFor="quantity"
                        required
                        aside={assetCode ? <span className="font-mono text-[11px] font-medium text-muted-foreground">{assetCode}</span> : undefined}
                      >
                        <Input
                          id="quantity"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={formData.quantity}
                          onChange={(e) => handleInputChange('quantity', e.target.value)}
                          placeholder="0.00"
                          required
                          className="tabular-nums"
                        />
                      </Field>
                    </FieldGrid>
                  </div>
                </Section>

                {/* Wallet & bank */}
                <Section title="Wallet & bank">
                  <FieldGrid>
                    <Field label="Wallet" htmlFor="credit_wallet_id" required>
                      <Select
                        value={formData.credit_wallet_id}
                        onValueChange={(value) => {
                          handleInputChange('credit_wallet_id', value);
                        }}
                      >
                        <SelectTrigger id="credit_wallet_id">
                          <SelectValue placeholder="Select wallet" />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets?.map((wallet) => (
                            <DetailSelectItem key={wallet.id} value={wallet.id} detail={wallet.chain_name || undefined}>
                              {wallet.wallet_name}
                            </DetailSelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field
                      label="Bank account"
                      htmlFor={isMultiplePayments ? undefined : "deduction_bank_account_id"}
                      required
                      className={isMultiplePayments ? "sm:col-span-2" : undefined}
                      aside={
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id="multiple_payments"
                            checked={isMultiplePayments}
                            onCheckedChange={(checked) => {
                              setIsMultiplePayments(checked === true);
                              if (checked) {
                                if (tdsCalculation.netPayable > 0) {
                                  setPaymentSplits([{
                                    bank_account_id: formData.deduction_bank_account_id || '',
                                    amount: tdsCalculation.netPayable.toFixed(2)
                                  }]);
                                }
                              } else {
                                setPaymentSplits([{ bank_account_id: '', amount: '' }]);
                              }
                            }}
                          />
                          <Label htmlFor="multiple_payments" className="cursor-pointer whitespace-nowrap text-xs font-medium text-muted-foreground">
                            Split payment
                          </Label>
                        </div>
                      }
                    >
                      {!isMultiplePayments ? (
                        <Select
                          value={formData.deduction_bank_account_id}
                          onValueChange={(value) => handleInputChange('deduction_bank_account_id', value)}
                        >
                          <SelectTrigger id="deduction_bank_account_id">
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
                                Allocated <span className="font-semibold text-foreground">{money2(splitAllocation.totalAllocated)}</span> of {money2(tdsCalculation.netPayable)} net payable
                              </span>
                            </div>
                            <ShareBar
                              value={splitAllocation.totalAllocated}
                              max={tdsCalculation.netPayable}
                              tone={splitAllocation.isValid ? "positive" : "warning"} className="bg-foreground/10"
                              label={`Allocated ${money2(splitAllocation.totalAllocated)} of ${money2(tdsCalculation.netPayable)}`}
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
                                    inputMode="decimal"
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
                                    onValueChange={(value) => updatePaymentSplit(index, 'bank_account_id', value)}
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
                              className="w-full"
                            >
                              <Plus className="h-4 w-4" />
                              Add another bank
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
                      <Field label="TDS" htmlFor="tds_option">
                        <Select
                          value={formData.tds_option}
                          onValueChange={(value) => handleInputChange('tds_option', value)}
                        >
                          <SelectTrigger id="tds_option">
                            <SelectValue placeholder="Select TDS option" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No TDS</SelectItem>
                            <SelectItem value="1%">1% TDS (with PAN)</SelectItem>
                            <SelectItem value="20%">20% TDS (without PAN)</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      {formData.tds_option === '1%' && (
                        <Field label="PAN number" htmlFor="pan_number" required>
                          <Input
                            id="pan_number"
                            value={formData.pan_number}
                            onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                            placeholder="ABCDE1234F"
                            maxLength={10}
                            className="uppercase font-mono placeholder:font-sans"
                          />
                        </Field>
                      )}
                    </FieldGrid>

                    {showTdsBreakdown && (
                      <div className="rounded-lg border border-border px-3 py-1 sm:px-4">
                        <SummaryRow label={`TDS (${tdsCalculation.tdsRate}%)`} value={`−${money2(tdsCalculation.tdsAmount)}`} />
                        <SummaryRow label="Net payable" value={money2(tdsCalculation.netPayable)} strong />
                      </div>
                    )}
                  </div>
                </Section>

                {/* Platform fee */}
                <Section title="Platform fee">
                  <div className="space-y-3.5">
                    <ToggleRow
                      title="Off-market order"
                      description="No platform fee is deducted, and the order gets the next OFP order number."
                      control={
                        <Switch
                          aria-label="Off-market order"
                          checked={formData.is_off_market}
                          onCheckedChange={async (checked) => {
                            handleInputChange('is_off_market', checked);
                            if (checked) {
                              // Preview off-market order number (without consuming sequence)
                              setIsGeneratingOrderNumber(true);
                              try {
                                const { data, error } = await supabase.rpc('preview_off_market_purchase_order_number');
                                if (!error && data) {
                                  handleInputChange('order_number', data);
                                }
                              } catch (err) {
                                console.error('Failed to preview off-market order number:', err);
                              } finally {
                                setIsGeneratingOrderNumber(false);
                              }
                            } else {
                              // Clear order number when turning off
                              handleInputChange('order_number', '');
                            }
                          }}
                        />
                      }
                    />

                    {!formData.is_off_market && (
                      <>
                        <FieldGrid>
                          <Field label="Platform fee (%)" htmlFor="fee_percentage" hint="Filled in from the wallet when it charges a fee.">
                            <Input
                              id="fee_percentage"
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              max="100"
                              value={formData.fee_percentage}
                              onChange={(e) => handleInputChange('fee_percentage', e.target.value)}
                              placeholder="Enter fee percentage"
                              className="tabular-nums"
                            />
                          </Field>
                        </FieldGrid>

                        {showFeeBreakdown && (
                          <div className="rounded-lg border border-border px-3 py-1 sm:px-4">
                            <SummaryRow label="Platform fee" value={`−${fmtAssetQty(feeCalculation.feeAmount, feeAsset)}`} />
                            <SummaryRow label="Net credit to wallet" value={fmtAssetQty(feeCalculation.netCredit, feeAsset)} strong />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Section>

                {/* Notes */}
                <Section title="Notes">
                  <Field label="Description" htmlFor="description">
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Enter purchase description"
                      rows={2}
                      className="min-h-[64px]"
                    />
                  </Field>
                </Section>
              </div>

              {/* Transaction summary. Below lg it shows only once there is an amount, as before;
                  on wide screens it stays in place as a live summary. */}
              <aside
                className={cn("min-w-0 lg:sticky lg:top-0 lg:self-start", !showSummary && "hidden lg:block")}
                aria-label="Transaction summary"
              >
                <Section title="Transaction summary" boxed bodyClassName="px-3 py-1.5 sm:px-4 sm:py-2">
                  {showSummary ? (
                    <>
                      <SummaryRow label="Order amount" value={money2(parseFloat(formData.total_amount))} />
                      {tdsCalculation.tdsRate > 0 && (
                        <SummaryRow label={`TDS deducted (${tdsCalculation.tdsRate}%)`} value={`−${money2(tdsCalculation.tdsAmount)}`} />
                      )}

                      {/* Bank deductions - split or single */}
                      {hasSplitAmounts ? (
                        <>
                          <p className="mt-1 border-t border-border pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                            Bank deductions
                          </p>
                          {paymentSplits.filter(s => parseFloat(s.amount) > 0).map((split, index) => {
                            const bank = bankAccounts?.find(b => b.id === split.bank_account_id);
                            return (
                              <SummaryRow
                                key={index}
                                label={bank?.account_name || 'Unknown bank'}
                                value={`−${money2(parseFloat(split.amount))}`}
                                className="py-1"
                              />
                            );
                          })}
                          <SummaryRow label="Total bank deduction" value={`−${money2(splitAllocation.totalAllocated)}`} strong />
                        </>
                      ) : (
                        <SummaryRow label="Bank deduction" value={`−${money2(tdsCalculation.netPayable)}`} strong />
                      )}

                      {selectedProduct?.code === 'USDT' && (
                        <div className="mt-2 border-t border-border pt-1">
                          <SummaryRow label="Quantity purchased" value={fmtAssetQty(parseFloat(formData.quantity || '0'), 'USDT')} />
                          {!formData.is_off_market && feeCalculation.feeAmount > 0 && (
                            <SummaryRow label="Platform fee" value={`−${fmtAssetQty(feeCalculation.feeAmount, 'USDT')}`} />
                          )}
                          <SummaryRow label="Wallet credit" value={`+${fmtAssetQty(feeCalculation.netCredit, 'USDT')}`} tone="positive" strong />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="py-1.5 text-xs leading-5 text-muted-foreground">
                      Enter the price and quantity to see what leaves the bank and what reaches the wallet.
                    </p>
                  )}
                </Section>
              </aside>
            </div>
          </DialogBody>

          <DialogFoot start={footNote ? <span className="hidden tabular-nums sm:inline lg:hidden">{footNote}</span> : undefined}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create order"
              )}
            </Button>
          </DialogFoot>
        </form>
      </DialogContent>
    </Dialog>
  );
};
