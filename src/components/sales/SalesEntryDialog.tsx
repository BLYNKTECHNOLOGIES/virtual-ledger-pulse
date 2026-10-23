
import { forwardRef, useState, useEffect, useMemo, useRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { useTriFieldCalc } from "@/hooks/useTriFieldCalc";
import { fetchAndLockMarketRate, linkSnapshotToReference } from "@/lib/effectiveUsdtEngine";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Plus, Minus, CheckCircle2, AlertCircle, Check, Loader2, Receipt, Wallet } from "lucide-react";
import { getLastOrderDefaults, saveLastOrderDefaults } from "@/utils/orderDefaults";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { calculateFee } from "@/hooks/useWalletFees";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, requireCurrentUserId } from "@/lib/system-action-logger";
import { resolveSalesOrderClientId, AmbiguousClientNameError } from "@/lib/salesClientLink";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { fetchActiveWalletsWithLedgerUsdtBalance, fetchWalletLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import { isAdjustmentBank } from "@/lib/adjustment-accounts";
import { cn } from "@/lib/utils";
import { ShareBar } from "@/components/finance-ui/primitives";
import {
  Callout,
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
  fmtRate,
} from "@/components/orders-ui";

interface PaymentSplit {
  payment_method_id: string;
  amount: string;
}

interface SalesEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ── Presentation helpers (private; candidates for the orders-ui kit) ───── */

/**
 * Select option whose muted detail (a balance, a usage figure) shows in the open list only;
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

export function SalesEntryDialog({ open, onOpenChange }: SalesEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { handleFieldChange: calcTriField, resetManualFlags } = useTriFieldCalc();
  
  // State for wallet balance and validation errors
  const [selectedWalletBalance, setSelectedWalletBalance] = useState<number | null>(null);
  const [selectedWalletFee, setSelectedWalletFee] = useState<number>(0);
  const [calculatedFee, setCalculatedFee] = useState<number>(0);
  const [stockValidationError, setStockValidationError] = useState<string | null>(null);
  const [formTouched, setFormTouched] = useState(false); // Track if user has started filling form
  const [isOffMarket, setIsOffMarket] = useState(false);
  const [isGeneratingOrderNumber, setIsGeneratingOrderNumber] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [isNewClient, setIsNewClient] = useState(false);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  // Split payment is rarely used — its toggle lives behind a "More" disclosure,
  // collapsed by default. Auto-expand if a split is somehow already active.
  const [showSplitOption, setShowSplitOption] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ payment_method_id: '', amount: '' }]);
  // Synchronous guard to prevent rapid double-submits creating duplicate orders.
  // React state / mutation.isPending update asynchronously, leaving a window where
  // multiple clicks each fire a fresh insert (the off-market RPC adds extra delay).
  const isSubmittingRef = useRef(false);

  const [formData, setFormData] = useState(() => {
    const lastDefaults = getLastOrderDefaults('sales');
    return {
      order_number: '',
      client_name: '',
      client_phone: '',
      client_state: '',
      product_id: lastDefaults.product_id || '',
      wallet_id: lastDefaults.wallet_id || '',
      platform: '',
      quantity: '',
      price_per_unit: lastDefaults.price_per_unit || '',
      total_amount: '',
      platform_fees: '',
      sales_payment_method_id: '',
      payment_status: 'COMPLETED',
      order_datetime: `${new Date().toISOString().slice(0, 16)}`,
      description: ''
    };
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return (data || []).filter((method: any) => !isAdjustmentBank(method.bank_accounts?.account_name));
    },
  });

  // Fetch wallets with ledger-backed USDT balances
  const { data: wallets } = useQuery({
    queryKey: ['wallets_with_ledger_usdt_sales_entry'],
    queryFn: async () => {
      return fetchActiveWalletsWithLedgerUsdtBalance('id, wallet_name, current_balance, fee_percentage, is_fee_enabled');
    },
  });

  // Fetch specific wallet balance when wallet is selected
  const { data: walletBalance } = useQuery({
    queryKey: ['wallet_balance', formData.wallet_id],
    queryFn: async () => {
      if (!formData.wallet_id) return null;
      const selectedWallet = wallets?.find((w) => w.id === formData.wallet_id);
      const liveBalance = await fetchWalletLedgerUsdtBalance(formData.wallet_id);

      return {
        current_balance: liveBalance,
        wallet_name: selectedWallet?.wallet_name || 'Selected wallet',
        fee_percentage: Number(selectedWallet?.fee_percentage || 0),
        is_fee_enabled: Boolean(selectedWallet?.is_fee_enabled),
      };
    },
    enabled: !!formData.wallet_id,
  });

  // Update selected wallet balance and fee when wallet data changes
  useEffect(() => {
    setSelectedWalletBalance(walletBalance?.current_balance || null);
    if (walletBalance?.is_fee_enabled) {
      setSelectedWalletFee(walletBalance?.fee_percentage || 0);
    } else {
      setSelectedWalletFee(0);
    }
  }, [walletBalance]);

  // Auto-calculate and sync platform fee when quantity or wallet fee changes
  useEffect(() => {
    if (!isOffMarket && selectedWalletFee > 0) {
      const quantity = parseFloat(formData.quantity) || 0;
      const feeAmount = quantity * (selectedWalletFee / 100);
      setCalculatedFee(feeAmount);
      
      // Sync to form data for submission
      setFormData(prev => ({
        ...prev,
        platform_fees: feeAmount.toFixed(6)
      }));
    } else {
      setCalculatedFee(0);
      setFormData(prev => ({
        ...prev,
        platform_fees: '0'
      }));
    }
  }, [formData.quantity, selectedWalletFee, isOffMarket]);

  // Validate stock quantity whenever quantity or platform fees changes
  useEffect(() => {
    if (formData.quantity && selectedWalletBalance !== null) {
      const quantity = parseFloat(formData.quantity);
      const platformFees = parseFloat(formData.platform_fees) || 0;
      const totalQuantityNeeded = quantity + platformFees;
      
      if (totalQuantityNeeded > selectedWalletBalance) {
        setStockValidationError(`Total required quantity (${totalQuantityNeeded.toFixed(2)}) exceeds available balance!`);
      } else {
        setStockValidationError(null);
      }
    } else {
      setStockValidationError(null);
    }
  }, [formData.quantity, formData.platform_fees, selectedWalletBalance]);


  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(
            account_name,
            bank_name
          )
        `)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // No longer need separate bank accounts query for split - using paymentMethods instead

  // Split payment allocation calculation
  const splitAllocation = useMemo(() => {
    const total = parseFloat(formData.total_amount) || 0;
    const totalAllocated = paymentSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const remaining = total - totalAllocated;
    const isValid = Math.abs(remaining) <= 0.01 && paymentSplits.every(s => s.payment_method_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, formData.total_amount]);

  const addPaymentSplit = () => {
    setPaymentSplits(prev => [...prev, { payment_method_id: '', amount: '' }]);
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

  // Auto-fill first split amount when total changes
  useEffect(() => {
    if (isSplitPayment && paymentSplits.length === 1) {
      const total = parseFloat(formData.total_amount) || 0;
      const currentAmount = parseFloat(paymentSplits[0].amount) || 0;
      if (total > 0 && currentAmount === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: total.toFixed(2) }]);
      }
    }
  }, [isSplitPayment, formData.total_amount]);

  const createSalesOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      // Get current user ID for tracking creator — REQUIRED
      const createdBy = await requireCurrentUserId();

      // Fetch CoinUSDT market rate at order creation time
      const selectedProd = products?.find((p: any) => p.id === data.product_id);
      const assetCode = selectedProd?.code?.toUpperCase() || 'USDT';
      const locked = await fetchAndLockMarketRate(assetCode, { entryType: 'manual_sales' });
      const marketRateUsdt = locked.price;
      
      const seEffRate = marketRateUsdt > 0 ? marketRateUsdt : 1;
      const seEffUsdtQty = data.quantity * seEffRate;
      const seEffUsdtRate = seEffUsdtQty > 0 ? data.total_amount / seEffUsdtQty : null;

      const { data: result, error } = await supabase
        .from('sales_orders')
        .insert([{
          order_number: data.order_number,
          // The picked client (or the only client with exactly this name) — never a guess.
          client_id: data.client_id || null,
          client_name: data.client_name,
          client_phone: data.client_phone || null,
          client_state: data.client_state || null,
          product_id: data.product_id || null,
          wallet_id: data.wallet_id,
          platform: data.platform || null,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          total_amount: data.total_amount,
          sales_payment_method_id: data.is_split_payment ? null : (data.sales_payment_method_id || null),
          payment_status: data.payment_status,
          order_date: data.order_datetime ? `${data.order_datetime}:00.000Z` : new Date().toISOString(),
          description: data.description,
          is_off_market: data.is_off_market || false,
          is_split_payment: data.is_split_payment || false,
          created_by: createdBy,
          market_rate_usdt: marketRateUsdt > 0 ? marketRateUsdt : null,
          effective_usdt_qty: seEffUsdtQty,
          effective_usdt_rate: seEffUsdtRate,
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Handle split payment bank credits
      if (data.is_split_payment && data.payment_splits && data.payment_status === 'COMPLETED') {
        const orderDate = data.order_datetime ? data.order_datetime.split('T')[0] : new Date().toISOString().split('T')[0];
        let hasAnyGateway = false;
        for (const split of data.payment_splits) {
          const splitAmount = parseFloat(split.amount);
          if (splitAmount <= 0 || !split.payment_method_id) continue;

          // Resolve bank_account_id from payment method
          const pm = paymentMethods?.find((m: any) => m.id === split.payment_method_id);
          const resolvedBankAccountId = pm?.bank_account_id;
          if (!resolvedBankAccountId) continue;

          const splitIsGateway = Boolean(pm?.payment_gateway);

          if (splitIsGateway) {
            // Gateway/POS split → create pending settlement
            hasAnyGateway = true;
            await supabase.from('pending_settlements').insert({
              sales_order_id: result.id,
              order_number: data.order_number,
              client_name: data.client_name,
              total_amount: splitAmount,
              settlement_amount: splitAmount,
              order_date: orderDate,
              payment_method_id: split.payment_method_id,
              bank_account_id: resolvedBankAccountId,
              settlement_cycle: pm?.settlement_cycle || 'T+1 Day',
              settlement_days: pm?.settlement_days || null,
              expected_settlement_date: pm?.settlement_days
                ? new Date(new Date(orderDate).getTime() + (pm.settlement_days * 86400000)).toISOString().split('T')[0]
                : new Date(new Date(orderDate).getTime() + 86400000).toISOString().split('T')[0],
              status: 'PENDING',
              created_by: createdBy,
            });
          } else {
            // Direct bank split → create INCOME bank transaction
            await supabase.from('bank_transactions').insert({
              bank_account_id: resolvedBankAccountId,
              transaction_type: 'INCOME',
              amount: splitAmount,
              transaction_date: orderDate,
              description: `Sales Order - ${data.order_number} - ${data.client_name} (Split)`,
              reference_number: data.order_number,
              category: 'Sales',
              related_account_name: data.client_name,
              created_by: createdBy,
            });
          }

          // Record split
          await supabase.from('sales_order_payment_splits').insert({
            sales_order_id: result.id,
            bank_account_id: resolvedBankAccountId,
            amount: splitAmount,
            payment_method_id: split.payment_method_id,
            is_gateway: splitIsGateway,
            created_by: createdBy,
          });
        }

        // Set settlement status based on whether any gateway splits exist
        await supabase
          .from('sales_orders')
          .update({ settlement_status: hasAnyGateway ? 'PENDING' : 'DIRECT' })
          .eq('id', result.id);

        // Guarantee one pending settlement per gateway split
        await supabase.rpc('sync_split_payment_settlements', { p_order_id: result.id });
      }

      // Set settlement status and handle bank crediting based on payment method type (non-split)
      if (!data.is_split_payment && data.sales_payment_method_id && data.payment_status === 'COMPLETED') {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id, payment_gateway, current_usage, payment_limit')
          .eq('id', data.sales_payment_method_id)
          .single();

        // Update settlement status based on payment method type
        const settlementStatus = paymentMethod?.payment_gateway ? 'PENDING' : 'DIRECT';
        
        await supabase
          .from('sales_orders')
          .update({ settlement_status: settlementStatus })
          .eq('id', result.id);

        // Bank transaction will be handled by triggers if applicable
      }

      // Process wallet deduction if wallet is selected and payment is completed
      if (data.wallet_id && data.payment_status === 'COMPLETED') {
        const quantity = parseFloat(data.quantity);
        
        // Deduct only the quantity sold from wallet (not including fees)
        const { error: walletDeductError } = await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: result.id,
          wallet_id: data.wallet_id,
          usdt_amount: quantity  // Only the quantity sold, fees are separate
        });

        if (walletDeductError) {
          console.error('Error processing wallet deduction:', walletDeductError);
          throw new Error(`Wallet deduction failed: ${walletDeductError.message}`);
        }
        
        // Process platform fee deduction separately (if applicable)
        const platformFees = parseFloat(data.platform_fees) || 0;
        if (platformFees > 0) {
          const { data: feeResult, error: feeError } = await supabase.rpc('process_platform_fee_deduction', {
            p_order_id: result.id,
            p_order_type: 'SALES_ORDER',
            p_wallet_id: data.wallet_id,
            p_fee_amount: platformFees,
            p_order_number: data.order_number
          });
          
          if (feeError) {
            console.error('Error processing platform fee:', feeError);
            // Don't throw - the main order was created, just log the fee error
            console.warn('⚠️ Platform fee deduction failed, but order was created');
          }
          
          // Update the sales order with fee details
          await supabase
            .from('sales_orders')
            .update({ 
              fee_amount: platformFees,
              fee_percentage: selectedWalletFee
            })
            .eq('id', result.id);
        }
      }

      // No linked client (nothing picked and no client with exactly this name): a new buyer,
      // so create an onboarding approval request. A linked client gets the order's details.
      if (!data.client_id) {
        const { error: approvalError } = await supabase
          .from('client_onboarding_approvals')
          .insert({
            sales_order_id: result.id,
            client_name: data.client_name,
            client_phone: data.client_phone || null,
            client_state: data.client_state || null,
            order_amount: data.total_amount,
           order_date: data.order_datetime ? data.order_datetime.split('T')[0] : new Date().toISOString().split('T')[0],
            approval_status: 'PENDING'
          });

        if (approvalError) {
          console.error('Failed to create approval request:', approvalError);
        }
      } else {
        // Update client's phone/state if provided in the order
        const { updateClientFromOrder } = await import('@/utils/updateClientFromOrder');
        await updateClientFromOrder({
          clientId: data.client_id,
          phone: data.client_phone,
          state: data.client_state,
          panNumber: data.pan_number,
        });
      }

      return result;
    },
    onSuccess: (data) => {
      // Save last used defaults for next order
      saveLastOrderDefaults({
        wallet_id: formData.wallet_id,
        product_id: formData.product_id,
        price_per_unit: formData.price_per_unit,
      }, 'sales');
      
      // Close dialog first to ensure it always closes
      onOpenChange(false);
      
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.SALES_MANUAL_ENTRY_CREATED,
        entityType: EntityTypes.SALES_ORDER,
        entityId: data.id,
        module: Modules.SALES,
        metadata: { order_number: data.order_number, client_name: formData.client_name, total_amount: formData.total_amount }
      });
      
      toast({ title: "Success", description: "Sales order created successfully. New clients will appear in approvals queue." });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      // Reset form with saved defaults pre-filled
      const nextDefaults = getLastOrderDefaults('sales');
      setFormData({
        order_number: '',
        client_name: '',
        client_phone: '',
        client_state: '',
        product_id: nextDefaults.product_id || '',
        wallet_id: nextDefaults.wallet_id || '',
        platform: '',
        quantity: '',
        price_per_unit: nextDefaults.price_per_unit || '',
        total_amount: '',
        platform_fees: '',
        sales_payment_method_id: '',
        payment_status: 'COMPLETED',
        order_datetime: `${new Date().toISOString().slice(0, 16)}`,
        description: ''
      });
      setFormTouched(false);
      setIsOffMarket(false);
      setSelectedClientId(undefined);
      setIsNewClient(false);
      setIsSplitPayment(false);
      setShowSplitOption(false);
      setPaymentSplits([{ payment_method_id: '', amount: '' }]);
    },
    onError: (error: any) => {
      console.error('❌ Error creating sales order:', error);
      toast({ 
        title: "Error Creating Sales Order", 
        description: error?.message || "Failed to create sales order. Please check your inputs and try again.", 
        variant: "destructive" 
      });
    },
    // Release the submit guard whether the order succeeded or failed.
    onSettled: () => {
      isSubmittingRef.current = false;
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Hard stop against rapid double-submits: this flag flips synchronously,
    // before any async work (off-market RPC / mutation) starts. Without it,
    // multiple quick clicks each created a separate duplicate order.
    if (isSubmittingRef.current || createSalesOrderMutation.isPending) {
      return;
    }
    // Collect all validation errors
    const errors: string[] = [];
    
    // For off-market orders, order number will be generated at creation time
    if (!isOffMarket && !formData.order_number.trim()) {
      errors.push("Order number is required");
    }
    
    if (!formData.client_name.trim()) {
      errors.push("Customer name is required");
    }
    
    if (!formData.wallet_id) {
      errors.push("Wallet selection is required");
    }
    
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      errors.push("Valid quantity is required");
    }
    
    if (!formData.price_per_unit || parseFloat(formData.price_per_unit) <= 0) {
      errors.push("Valid price per unit is required");
    }
    
    if (stockValidationError) {
      errors.push(stockValidationError);
    }

    if (isSplitPayment) {
      if (!splitAllocation.isValid) {
        errors.push(`Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)}`);
      }
      const methodIds = paymentSplits.map(s => s.payment_method_id);
      if (new Set(methodIds).size !== methodIds.length) {
        errors.push("Duplicate payment methods in split payment");
      }
    }
    
    if (errors.length > 0) {
      
      toast({ 
        title: "Validation Error", 
        description: errors.join(". "), 
        variant: "destructive" 
      });
      return;
    }
    // Engage the guard now — kept until the mutation settles (onSettled).
    isSubmittingRef.current = true;

    // For off-market orders, generate the actual order number at submission (consuming the sequence)
    const submitOrder = async () => {
      let orderNumber = formData.order_number;

      // Settle which client this order belongs to before anything is written or numbered.
      let clientId: string | null;
      try {
        clientId = await resolveSalesOrderClientId(selectedClientId, formData.client_name);
      } catch (err: any) {
        isSubmittingRef.current = false;
        toast({
          title: err instanceof AmbiguousClientNameError ? "Pick the customer" : "Error",
          description: err instanceof AmbiguousClientNameError ? err.message : `Could not check the customer: ${err?.message || 'unknown error'}`,
          variant: "destructive"
        });
        return;
      }

      if (isOffMarket) {
        try {
          const { data: offMarketNumber, error } = await supabase.rpc('generate_off_market_sales_order_number');
          if (error || !offMarketNumber) {
            isSubmittingRef.current = false;
            toast({
              title: "Error",
              description: "Failed to generate off-market order number",
              variant: "destructive"
            });
            return;
          }
          orderNumber = offMarketNumber;
        } catch (err) {
          isSubmittingRef.current = false;
          console.error('Failed to generate off-market order number:', err);
          toast({
            title: "Error",
            description: "Failed to generate off-market order number",
            variant: "destructive"
          });
          return;
        }
      }
      
      createSalesOrderMutation.mutate({
        ...formData,
        client_id: clientId,
        order_number: orderNumber,
        is_off_market: isOffMarket,
        is_split_payment: isSplitPayment,
        payment_splits: isSplitPayment ? paymentSplits : null,
        platform_fees: isOffMarket ? '0' : formData.platform_fees
      });
    };
    
    submitOrder();
  };

  const handleInputChange = (field: string, value: any) => {
    // Mark form as touched when user starts entering data
    if (!formTouched) {
      setFormTouched(true);
    }
    
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-populate platform when wallet is selected and fetch balance
      if (field === 'wallet_id' && value && wallets) {
        const selectedWallet = wallets.find(w => w.id === value);
        if (selectedWallet) {
          // Extract platform name from wallet name (e.g., "BINANCE SS" -> "BINANCE")
          const platformName = selectedWallet.wallet_name.split(' ')[0];
          updated.platform = platformName;
          
          // Reset quantity when wallet changes to avoid validation issues
          updated.quantity = '';
          updated.platform_fees = '';
          updated.total_amount = '';
        }
        
        // Clear wallet balance when wallet changes
        setSelectedWalletBalance(null);
        setStockValidationError(null);
      }
      
      // Auto-calculate bidirectionally using useTriFieldCalc
      // Tracks whether total was manually entered to prevent cascading recalculations
      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const calcField = field === 'price_per_unit' ? 'price' : field === 'total_amount' ? 'total' : 'quantity';
        const result = calcTriField(calcField, String(value), {
          quantity: String(updated.quantity),
          price: String(updated.price_per_unit),
          total: String(updated.total_amount),
        });
        if (field !== 'quantity') updated.quantity = result.quantity;
        if (field !== 'price_per_unit') updated.price_per_unit = result.price;
        if (field !== 'total_amount') updated.total_amount = result.total;
      }
      
      return updated;
    });
  };

  // Display quantity for UI
  const quantity = parseFloat(formData.quantity) || 0;

  /* ── Presentation only: derived from the state above, never written back ── */
  const assetCode = String(products?.find((p: any) => p.id === formData.product_id)?.code || 'USDT').toUpperCase();
  const selectedWalletName = wallets?.find((w) => w.id === formData.wallet_id)?.wallet_name?.trim();
  const orderTotal = parseFloat(formData.total_amount) || 0;
  const walletDeduction = quantity + calculatedFee;
  const balanceAfter = selectedWalletBalance !== null ? selectedWalletBalance - walletDeduction : null;
  const paymentMethodLabel = (method: any) =>
    method.nickname
      ? method.nickname
      : method.type === 'UPI' && method.upi_id
        ? `${method.upi_id} (${method.risk_category})`
        : method.bank_accounts
          ? `${method.bank_accounts.account_name} (${method.risk_category})`
          : `${method.type} (${method.risk_category})`;
  const paymentMethodUsage = (method: any) => `${fmtInr(method.current_usage)} / ${fmtInr(method.payment_limit)}`;
  const selectedPaymentMethod: any = isSplitPayment
    ? undefined
    : paymentMethods?.find((m: any) => m.id === formData.sales_payment_method_id);
  const remainingIsZero = Math.abs(splitAllocation.remaining) < 0.005;
  // The summary rounds stablecoin figures to 4 decimals so the column stays readable; inputs keep full precision.
  const summaryDecimals = ['USDT', 'USDC'].includes(assetCode) ? 4 : 8;
  const summaryQty = (value: number) => fmtAssetQty(value, assetCode, summaryDecimals);
  const feeSummary = (() => {
    if (isOffMarket) return { value: "None", hint: "Off-market order" };
    if (selectedWalletFee > 0) return { value: quantity > 0 ? summaryQty(calculatedFee) : "—", hint: `${selectedWalletFee}% of quantity` };
    return { value: formData.wallet_id ? "None" : "—", hint: undefined };
  })();
  const footAmount = orderTotal > 0 ? fmtInr(orderTotal) : null;
  const footQuantity = quantity > 0 ? summaryQty(quantity) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("xxl")}>
        <DialogHead
          icon={Receipt}
          title="Create sales order"
          description="Records a completed sale in the ERP. Wallet stock and the payment are posted as soon as you create it."
          meta={
            isOffMarket || isSplitPayment ? (
              <>
                {isOffMarket && <Chip tone="info">Off-market</Chip>}
                {isSplitPayment && <Chip tone="neutral">Split payment</Chip>}
              </>
            ) : undefined
          }
        />

        <form
          onSubmit={handleSubmit}
          className={DIALOG_FORM}
          noValidate
        >
          <DialogBody>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="min-w-0 space-y-6">
                {/* Order */}
                <Section title={<SectionTitle>Order</SectionTitle>}>
                  <div className="space-y-3.5">
                    <FieldGrid>
                      <Field
                        label="Order number"
                        htmlFor="se-order-number"
                        required={!isOffMarket}
                        hint={isOffMarket ? "Preview — the final OFS number is assigned when the order is created." : undefined}
                      >
                        <div className="relative">
                          <Input
                            id="se-order-number"
                            autoFocus
                            value={formData.order_number}
                            onChange={(e) => handleInputChange('order_number', e.target.value)}
                            placeholder={isGeneratingOrderNumber ? "Generating..." : isOffMarket ? "Auto-generated" : "Enter order number"}
                            required
                            disabled={isOffMarket || isGeneratingOrderNumber}
                            className={cn(
                              "font-mono placeholder:font-sans",
                              isOffMarket && "bg-muted disabled:opacity-100",
                              isGeneratingOrderNumber && "pr-9",
                            )}
                          />
                          {isGeneratingOrderNumber && (
                            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
                          )}
                        </div>
                      </Field>
                      <Field label="Order date & time" htmlFor="se-order-datetime">
                        <Input
                          id="se-order-datetime"
                          type="datetime-local"
                          value={formData.order_datetime}
                          onChange={(e) => handleInputChange('order_datetime', e.target.value)}
                        />
                      </Field>
                    </FieldGrid>

                    <ToggleRow
                      title="Off-market order"
                      description="No platform fee is deducted, and the order gets the next OFS order number."
                      control={
                        <Switch
                          aria-label="Off-market order"
                          checked={isOffMarket}
                          onCheckedChange={async (checked) => {
                            setIsOffMarket(checked);
                            if (checked) {
                              // Preview off-market order number (without consuming sequence)
                              setIsGeneratingOrderNumber(true);
                              try {
                                const { data, error } = await supabase.rpc('preview_off_market_sales_order_number');
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
                  </div>
                </Section>

                {/* Customer */}
                <Section title={<SectionTitle>Customer</SectionTitle>}>
                  <div className="space-y-3.5">
                    <Field label="Customer name" htmlFor="customerName" required>
                      <CustomerAutocomplete
                        hideLabel
                        value={formData.client_name}
                        onChange={(value) => handleInputChange('client_name', value)}
                        onPhoneChange={(phone) => handleInputChange('client_phone', phone)}
                        onStateChange={(state) => handleInputChange('client_state', state)}
                        onClientSelect={(client) => {
                          if (client) {
                            setSelectedClientId(client.id);
                            // Auto-fill is handled by CustomerAutocomplete via onPhoneChange and onStateChange
                          } else {
                            setSelectedClientId(undefined);
                            // Clear auto-filled fields when client is deselected
                            setFormData(prev => ({
                              ...prev,
                              client_phone: '',
                              client_state: ''
                            }));
                          }
                        }}
                        onNewClient={(isNew) => setIsNewClient(isNew)}
                        selectedClientId={selectedClientId}
                      />
                    </Field>

                    <FieldGrid>
                      <Field label="Phone" htmlFor="se-client-phone">
                        <Input
                          id="se-client-phone"
                          inputMode="tel"
                          value={formData.client_phone}
                          onChange={(e) => handleInputChange('client_phone', e.target.value)}
                          placeholder="Enter phone"
                          className="tabular-nums"
                        />
                      </Field>
                      <Field label="State" htmlFor="se-client-state">
                        <Select
                          value={formData.client_state}
                          onValueChange={(value) => handleInputChange('client_state', value)}
                        >
                          <SelectTrigger id="se-client-state">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent className="z-[100] max-h-60">
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
                      <Field label="Product" htmlFor="se-product">
                        <Select
                          value={formData.product_id}
                          onValueChange={(value) => handleInputChange('product_id', value)}
                        >
                          <SelectTrigger id="se-product">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent className="z-[100]">
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

                      <Field label="Wallet" htmlFor="se-wallet" required>
                        <Select
                          value={formData.wallet_id}
                          onValueChange={(value) => handleInputChange('wallet_id', value)}
                        >
                          <SelectTrigger id="se-wallet">
                            <SelectValue placeholder="Select wallet" />
                          </SelectTrigger>
                          <SelectContent className="z-[100]">
                            {wallets?.map((wallet) => (
                              <DetailSelectItem key={wallet.id} value={wallet.id} detail={fmtAssetQty(wallet.current_balance, 'USDT')}>
                                {wallet.wallet_name}
                              </DetailSelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGrid>

                    <FieldGrid cols={3}>
                      <Field label="Total amount" htmlFor="se-total-amount">
                        <RupeeAffix>
                          <Input
                            id="se-total-amount"
                            type="number"
                            inputMode="decimal"
                            value={formData.total_amount}
                            onChange={(e) => handleInputChange('total_amount', parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            placeholder="Enter total amount"
                            className="pl-7 tabular-nums"
                          />
                        </RupeeAffix>
                      </Field>

                      <Field label="Price per unit" htmlFor="se-price-per-unit" required>
                        <RupeeAffix>
                          <Input
                            id="se-price-per-unit"
                            type="number"
                            inputMode="decimal"
                            value={formData.price_per_unit}
                            onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                            required
                            min="0"
                            step="0.01"
                            placeholder="Enter price per unit"
                            className="pl-7 tabular-nums"
                          />
                        </RupeeAffix>
                      </Field>

                      <Field
                        label="Quantity"
                        htmlFor="se-quantity"
                        required
                        aside={<span className="font-mono text-[11px] font-medium text-muted-foreground">{assetCode}</span>}
                      >
                        <Input
                          id="se-quantity"
                          type="number"
                          inputMode="decimal"
                          value={formData.quantity}
                          onChange={(e) => handleInputChange('quantity', e.target.value)}
                          required
                          min="0"
                          step="0.01"
                          placeholder="Enter quantity"
                          className={cn("tabular-nums", stockValidationError && "border-destructive")}
                        />
                      </Field>
                    </FieldGrid>

                    {/* Wallet balance: neutral note, or the stock error when the quantity doesn't fit */}
                    {(stockValidationError || selectedWalletBalance !== null) && (
                      <Callout
                        tone={stockValidationError ? "danger" : "neutral"}
                        icon={stockValidationError ? AlertTriangle : Wallet}
                        title={stockValidationError || undefined}
                      >
                        {selectedWalletBalance !== null && (
                          <>
                            Available in {selectedWalletName || "the selected wallet"}:{" "}
                            <span className="font-semibold tabular-nums text-foreground">{fmtAssetQty(selectedWalletBalance, 'USDT')}</span>
                            {selectedWalletFee > 0 && !isOffMarket && (
                              <span className="text-muted-foreground"> · platform fee {selectedWalletFee}%</span>
                            )}
                          </>
                        )}
                      </Callout>
                    )}
                  </div>
                </Section>

                {/* Payment */}
                <Section title={<SectionTitle>Payment</SectionTitle>}>
                  <Field
                    label="Payment method"
                    htmlFor={isSplitPayment ? undefined : "se-payment-method"}
                    hint={selectedPaymentMethod ? `${fmtInr(selectedPaymentMethod.current_usage)} of ${fmtInr(selectedPaymentMethod.payment_limit)} limit used` : undefined}
                    aside={
                      (showSplitOption || isSplitPayment) ? (
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id="split-sales-payment-manual"
                            checked={isSplitPayment}
                            onCheckedChange={(checked) => {
                              setIsSplitPayment(!!checked);
                              if (checked) {
                                const total = parseFloat(formData.total_amount) || 0;
                                setPaymentSplits([{ payment_method_id: '', amount: total > 0 ? total.toFixed(2) : '' }]);
                              } else {
                                setPaymentSplits([{ payment_method_id: '', amount: '' }]);
                              }
                            }}
                          />
                          <Label htmlFor="split-sales-payment-manual" className="cursor-pointer whitespace-nowrap text-xs font-medium text-muted-foreground">
                            Split payment
                          </Label>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowSplitOption(true)}
                          className="whitespace-nowrap rounded-sm text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          More options
                        </button>
                      )
                    }
                  >
                    {!isSplitPayment ? (
                      <Select
                        value={formData.sales_payment_method_id}
                        onValueChange={(value) => handleInputChange('sales_payment_method_id', value)}
                      >
                        <SelectTrigger id="se-payment-method">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                          {paymentMethods?.map((method) => (
                            <DetailSelectItem key={method.id} value={method.id} detail={paymentMethodUsage(method)}>
                              {paymentMethodLabel(method)}
                            </DetailSelectItem>
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
                              Allocated <span className="font-semibold text-foreground">{money2(splitAllocation.totalAllocated)}</span> of {money2(orderTotal)}
                            </span>
                          </div>
                          <ShareBar
                            value={splitAllocation.totalAllocated}
                            max={orderTotal}
                            tone={splitAllocation.isValid ? "positive" : "warning"} className="bg-foreground/10"
                            label={`Allocated ${money2(splitAllocation.totalAllocated)} of ${money2(orderTotal)}`}
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
                                  value={split.payment_method_id}
                                  onValueChange={(value) => updatePaymentSplit(index, 'payment_method_id', value)}
                                >
                                  <SelectTrigger aria-label={`Split ${index + 1} payment method`}>
                                    <SelectValue placeholder="Select payment method" />
                                  </SelectTrigger>
                                  <SelectContent className="z-[100]">
                                    {paymentMethods?.map((method: any) => (
                                      <DetailSelectItem key={method.id} value={method.id} detail={paymentMethodUsage(method)}>
                                        {paymentMethodLabel(method)}
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
                            className="w-full"
                          >
                            <Plus className="h-4 w-4" />
                            Add another payment method
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
                  <Field label="Description" htmlFor="se-description">
                    <Textarea
                      id="se-description"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      rows={3}
                      placeholder="Optional — anything the team should know about this sale"
                    />
                  </Field>
                </Section>
              </div>

              {/* Live summary: every figure is computed above or simple display math on it */}
              <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start" aria-label="Order summary">
                <Section title={<SectionTitle>Summary</SectionTitle>} boxed bodyClassName="px-3 py-1 sm:px-4 sm:py-1.5">
                  <SummaryRow label="Amount" value={fmtInr(formData.total_amount)} />
                  <SummaryRow label="Price per unit" value={fmtRate(formData.price_per_unit)} />
                  <SummaryRow label="Quantity" value={quantity > 0 ? summaryQty(quantity) : "—"} />
                  <SummaryRow label="Platform fee" value={feeSummary.value} hint={feeSummary.hint} />
                  <SummaryRow
                    strong
                    label="From wallet"
                    hint="Quantity + fee"
                    value={quantity > 0 ? summaryQty(walletDeduction) : "—"}
                  />
                  {balanceAfter !== null && assetCode === 'USDT' && quantity > 0 && (
                    <SummaryRow
                      label="Balance after"
                      hint={selectedWalletName}
                      value={summaryQty(balanceAfter)}
                      tone={balanceAfter < 0 ? "negative" : "muted"}
                    />
                  )}
                </Section>
              </aside>
            </div>
          </DialogBody>

          {/* Below lg the summary sits under the form, so the footer repeats the order's size */}
          <DialogFoot
            start={
              footAmount || footQuantity ? (
                <span className="tabular-nums lg:hidden">
                  {footAmount}
                  {footAmount && footQuantity && <span className="hidden sm:inline"> · </span>}
                  {footQuantity && <span className={cn(footAmount && "hidden sm:inline")}>{footQuantity}</span>}
                </span>
              ) : undefined
            }
          >
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createSalesOrderMutation.isPending}

            >
              {createSalesOrderMutation.isPending ? (
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
}
