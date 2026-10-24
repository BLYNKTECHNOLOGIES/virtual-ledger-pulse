import { useState, useEffect, useRef } from "react";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeftRight,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { PaymentMethodSelectionDialog } from "./PaymentMethodSelectionDialog";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import { fetchAndLockMarketRate } from "@/lib/effectiveUsdtEngine";
import {
  buildNewOrderRpcArgs,
  isMethodAvailable,
  istDay,
  newOrderErrorMessage,
  newOrderErrorTitle,
  pickAutoMethod,
  platformFeeFor,
  quantityFor,
  riskCategoryForAppetite,
  withLiveSalesUsage,
} from "@/lib/sales-new-order";
import { cn } from "@/lib/utils";
import {
  Callout,
  Chip,
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  Field,
  FieldGrid,
  PanelSkeleton,
  Section,
  SummaryRow,
  dialogContentClass,
  fmtAssetQty,
  fmtInr,
  fmtQty,
} from "@/components/orders-ui";

interface StepBySalesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryClient: any;
}

type FlowStep = 'order-type' | 'amount-verification' | 'payment-type-selection' | 'payment-method-display' | 'action-buttons' | 'final-form' | 'alternative-method-choice' | 'user-paying-status';

export function StepBySalesFlow({ open, onOpenChange, queryClient: passedQueryClient }: StepBySalesFlowProps) {
  const { toast } = useToast();
  const queryClient = passedQueryClient;
  
  const [currentStep, setCurrentStep] = useState<FlowStep>('order-type');
  const [orderType, setOrderType] = useState<'repeat' | 'new' | null>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [newClientData, setNewClientData] = useState({
    name: '',
    phone: '',
    walletId: '',
    client_type: 'INDIVIDUAL',
    risk_appetite: 'HIGH_RISK'
  });
  const [orderAmount, setOrderAmount] = useState('');
  const [cosmosAlert, setCosmosAlert] = useState(false);
  const [paymentType, setPaymentType] = useState<'UPI' | 'Bank Transfer' | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<any[]>([]);
  const [usedPaymentMethods, setUsedPaymentMethods] = useState<string[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  // Payment-method picker (User paying, Change method): the type it lists and the account it preselects.
  const [pickerType, setPickerType] = useState<'UPI' | 'Bank Transfer'>('UPI');
  const [pickerMethodId, setPickerMethodId] = useState<string | undefined>(undefined);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set synchronously on submit, so a fast double click cannot save the order (or the lead) twice.
  const submittingRef = useRef(false);
  const leadSubmittingRef = useRef(false);
  // Only the latest receiving-account lookup may update the step.
  const methodsRequestRef = useRef(0);
  // Generate unique order number - only used as fallback if user doesn't provide one
  const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ORD-${timestamp}-${random}`;
  };

  const [finalOrderData, setFinalOrderData] = useState({
    order_number: "", // Empty - user must enter order number
    quantity: 1, 
    description: '', 
    stockName: '', 
    walletId: '', 
    price: 0
  });

  // Fetch existing clients
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => supabase.from('clients').select('*').order('name'));
      return data;

    },
  });

  // Fetch products with available quantity
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      // Stock syncing is handled by database triggers automatically
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch wallets with ledger-backed USDT balances
  const { data: wallets } = useQuery({
    queryKey: ['wallets_with_ledger_usdt_step_flow'],
    queryFn: async () => {
      return fetchActiveWalletsWithLedgerUsdtBalance('id, wallet_name, is_active, current_balance, fee_percentage, is_fee_enabled');
    },
  });

  // Remove warehouse functionality - using wallets only

  // Payment-method risk category for the client (one mapping for the whole flow, see sales-new-order.ts).
  const clientRiskCategory = riskCategoryForAppetite(selectedClient?.risk_appetite || newClientData.risk_appetite);

  // Fetch payment methods when payment type is selected
  const fetchPaymentMethods = async () => {
    if (!paymentType) return;
    const request = ++methodsRequestRef.current;
    setMethodsLoading(true);
    setMethodsError(null);

    try {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name, status), payment_gateway')
        .eq('is_active', true)
        .eq('risk_category', clientRiskCategory)
        .eq('type', paymentType === 'UPI' ? 'UPI' : 'Bank Account');
      if (error) throw error;

      // Limits are compared with the live usage, in code (the stored current_usage is not maintained).
      const methods = await withLiveSalesUsage(data || []);
      if (request !== methodsRequestRef.current) return;
      setAvailablePaymentMethods(methods);

      // Keep the account already chosen while it still has room; otherwise the next one that hasn't been shown.
      setSelectedPaymentMethod((current: any) =>
        methods.find((method) => method.id === current?.id && isMethodAvailable(method, method.current_usage)) ??
        methods.find((method) => isMethodAvailable(method, method.current_usage) && !usedPaymentMethods.includes(method.id)) ??
        null
      );
    } catch (error: any) {
      if (request !== methodsRequestRef.current) return;
      console.error('Error loading receiving accounts:', error);
      setAvailablePaymentMethods([]);
      setSelectedPaymentMethod(null);
      setMethodsError(error?.message || 'Unknown error');
    } finally {
      if (request === methodsRequestRef.current) setMethodsLoading(false);
    }
  };

  useEffect(() => {
    if (paymentType && (selectedClient || orderType === 'new')) {
      fetchPaymentMethods();
    }
  }, [paymentType, selectedClient, orderType, usedPaymentMethods]);

  // Auto-calculate quantity when amount or price changes
  useEffect(() => {
    const amount = parseFloat(orderAmount) || 0;
    if (finalOrderData.price > 0 && amount > 0) {
      const calculatedQuantity = quantityFor(amount, finalOrderData.price);
      setFinalOrderData(prev => ({ ...prev, quantity: calculatedQuantity }));
    }
  }, [orderAmount, finalOrderData.price]);

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (leadData: any) => {
      const { data, error } = await supabase.from('leads').insert([leadData]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Order cancelled", description: "The client and amount are saved in Leads for follow-up." });
      resetFlow();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Lead creation failed:', error);
      const message = `${String(error?.message || 'Unknown error').replace(/\.$/, '')}. Nothing was saved. Try again, or close this window and add the lead from Leads.`;
      setLeadError(message);
      toast({ title: "Lead not saved", description: message, variant: "destructive" });
    },
    onSettled: () => {
      leadSubmittingRef.current = false;
    }
  });

  // Create the sales order: one call to create_sales_order_with_postings writes the order, the wallet debit
  // and the platform fee in one transaction (all or nothing). The sales_orders INSERT triggers post the bank
  // INCOME (direct method) or the pending settlement (gateway method), the stock row and, for a client that
  // is not on file, the onboarding approval. Payment-method usage is computed live, so nothing updates it here.
  const createSalesOrderMutation = useMutation({
    mutationFn: async () => {
      const selectedProduct = products?.find(p => p.name === finalOrderData.stockName);
      const selectedWallet = wallets?.find(w => w.id === finalOrderData.walletId);
      const amount = parseFloat(orderAmount) || 0;
      if (!selectedPaymentMethod?.id) throw new Error('No receiving account is selected. Go back to the payment step and choose one.');
      if (!selectedProduct) throw new Error('Select the stock you sold.');
      if (!selectedWallet) throw new Error('Select the wallet the stock leaves from.');
      if (!(amount > 0)) throw new Error('The order amount must be more than zero. Go back and enter the amount.');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Your session has ended. Sign in again, then complete the order.');

      // Market rate locked at creation, as Manual entry does (1 for USDT; live USDT price for other assets).
      const assetCode = String(selectedProduct.code || 'USDT').toUpperCase();
      const locked = await fetchAndLockMarketRate(assetCode, { entryType: 'manual_sales' });

      const args = buildNewOrderRpcArgs({
        orderNumber: finalOrderData.order_number,
        clientId: orderType === 'repeat' ? selectedClient?.id ?? null : null,
        clientName: selectedClient?.name || newClientData.name.trim(),
        clientPhone: selectedClient?.phone || newClientData.phone,
        clientState: selectedClient?.state ?? null,
        riskLevel: selectedClient?.risk_appetite || newClientData.risk_appetite,
        cosmosAlert,
        amount,
        pricePerUnit: finalOrderData.price,
        product: { id: selectedProduct.id, code: selectedProduct.code },
        wallet: {
          id: selectedWallet.id,
          name: selectedWallet.wallet_name,
          feePercentage: selectedWallet.fee_percentage,
          feeEnabled: selectedWallet.is_fee_enabled,
        },
        paymentMethod: { id: selectedPaymentMethod.id, payment_gateway: selectedPaymentMethod.payment_gateway },
        marketRateUsdt: locked.price,
        description: finalOrderData.description,
        createdBy: user.id,
        orderDate: istDay(),
      });

      const { data, error } = await supabase.rpc('create_sales_order_with_postings' as any, args as any);
      // Marked so the message can tell a database refusal (nothing saved) from a lost answer (outcome unknown).
      if (error) throw Object.assign(error, { fromSaveCall: true });
      return data as unknown as { sales_order_id: string; order_number: string };
    },
    onSuccess: async (result) => {
      // The order is saved: nothing below may turn this into an error.
      try {
        // Repeat client: refresh phone/state on that client only, found by its id (never by name).
        // A client that is not on file gets its onboarding approval from the INSERT trigger
        // (trigger_create_client_onboarding_approval), so nothing is added here.
        if (orderType === 'repeat' && selectedClient?.id) {
          try {
            const { updateClientFromOrder } = await import('@/utils/updateClientFromOrder');
            await updateClientFromOrder({
              clientId: selectedClient.id,
              phone: selectedClient.phone,
              state: selectedClient.state,
            });
          } catch (followUpError) {
            console.error('Client follow-up after sales order failed:', followUpError);
            toast({
              title: "Client details not updated",
              description: "The order is saved. Check the client's phone and state on the Clients page.",
            });
          }
        }

        toast({
          title: "Sales order created",
          description: `Order ${result?.order_number || finalOrderData.order_number} is saved with its wallet, payment and stock entries.`,
        });
        queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
        queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['wallets'] });
        queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
        queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      } catch (afterSaveError) {
        console.error('After-save step failed (the order is saved):', afterSaveError);
      }
      resetFlow();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Sales order creation failed:', error);
      const message = newOrderErrorMessage(error);
      setSaveError(message);
      toast({
        title: newOrderErrorTitle(error),
        description: message,
        variant: "destructive"
      });
    },
    onSettled: () => {
      submittingRef.current = false;
    }
  });

  const resetFlow = () => {
    setCurrentStep('order-type');
    setOrderType(null);
    setSelectedClient(null);
    setNewClientData({ name: '', phone: '', walletId: '', client_type: 'INDIVIDUAL', risk_appetite: 'HIGH_RISK' });
    setOrderAmount('');
    setCosmosAlert(false);
    setPaymentType(null);
    setSelectedPaymentMethod(null);
    setAvailablePaymentMethods([]);
    setUsedPaymentMethods([]);
    setMethodsError(null);
    setLeadError(null);
    setSaveError(null);
    setPickerMethodId(undefined);
    setFinalOrderData({ order_number: generateOrderNumber(), quantity: 1, description: '', stockName: '', walletId: '', price: 0 });
  };

  const handleOrderTypeSelection = (type: 'repeat' | 'new') => {
    setOrderType(type);
    setCurrentStep('amount-verification');
  };

  const handleAmountVerification = () => {
    const amount = parseFloat(orderAmount) || 0;
    // Re-checked on every Continue: the alert saved with the order follows the amount entered last.
    setCosmosAlert(!!selectedClient && amount > (selectedClient.monthly_limit - selectedClient.current_month_used));
    setCurrentStep('payment-type-selection');
  };

  const handlePaymentTypeSelection = () => {
    // After a failed lookup, Continue tries again (the type itself may not have changed).
    if (methodsError) fetchPaymentMethods();
    setCurrentStep('payment-method-display');
  };

  const handleContinueToActions = () => {
    setCurrentStep('action-buttons');
  };

  const handleOrderCancelled = () => {
    if (leadSubmittingRef.current || createLeadMutation.isPending) return;
    leadSubmittingRef.current = true;
    setLeadError(null);
    const amount = parseFloat(orderAmount) || 0;
    // Real leads columns only (as Leads → New lead writes them); created_by is set by the leads trigger.
    const leadData = {
      name: (selectedClient?.name || newClientData.name || '').trim(),
      contact_number: (selectedClient?.phone || newClientData.phone || '').trim() || null,
      estimated_order_value: amount,
      status: 'NEW',
      lead_type: 'SELL',
      description: `Cancelled sales order for ${fmtInr(amount)}${paymentType ? ` (${paymentType})` : ''}.`
    };
    createLeadMutation.mutate(leadData);
  };

  const handleAlternativePaymentMethod = () => {
    setCurrentStep('alternative-method-choice');
  };

  const handleChangePaymentMethodType = () => {
    setPaymentType(null);
    setSelectedPaymentMethod(null);
    setUsedPaymentMethods([]);
    setCurrentStep('payment-type-selection');
  };

  const handleKeepSamePaymentType = () => {
    if (selectedPaymentMethod) {
      const newUsedMethods = [...usedPaymentMethods, selectedPaymentMethod.id];
      setUsedPaymentMethods(newUsedMethods);
      
      const nextMethod = availablePaymentMethods.find(method => 
        isMethodAvailable(method, method.current_usage) && 
        !newUsedMethods.includes(method.id) &&
        method.type === (paymentType === 'UPI' ? 'UPI' : 'Bank Account')
      );
      
      if (nextMethod) {
        setSelectedPaymentMethod(nextMethod);
        setCurrentStep('payment-method-display');
      } else {
        setSelectedPaymentMethod(null);
        setCurrentStep('payment-method-display');
      }
    }
  };

  // User paying: confirm the receiving account in the picker, then wait inside this dialog. Nothing is saved
  // until the payment is received and the sale details are submitted.
  const handleUserPaying = async () => {
    setLeadError(null);
    // The account already shown to the client stays selected while it still has room.
    if (selectedPaymentMethod && isMethodAvailable(selectedPaymentMethod, selectedPaymentMethod.current_usage)) {
      openMethodPicker(paymentType || 'UPI', selectedPaymentMethod.id);
      return;
    }
    const autoMethod = await autoSelectPaymentMethod(clientRiskCategory);
    openMethodPicker(autoMethod ? (autoMethod.type === 'Bank Account' ? 'Bank Transfer' : 'UPI') : paymentType || 'UPI', autoMethod?.id);
  };

  const openMethodPicker = (type: 'UPI' | 'Bank Transfer', methodId?: string) => {
    setPickerType(type);
    setPickerMethodId(methodId);
    setPaymentMethodDialogOpen(true);
  };

  /** Suggests an account for the picker; the flow's own selection changes only when the operator confirms one. */
  const autoSelectPaymentMethod = async (riskCategory: string) => {
    try {
      // Fetch the active payment methods for the risk category; limits are compared with live usage in code.
      const { data: methods, error } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(*)')
        .eq('is_active', true)
        .eq('risk_category', riskCategory);

      if (error) throw error;

      // Smart selection logic: UPI methods first (speed), then the one with the most room under its limit.
      const selectedMethod = pickAutoMethod(await withLiveSalesUsage(methods || []), (m) => m.current_usage);
      if (selectedMethod) {
        toast({
          title: "Payment method selected",
          description: `${selectedMethod.type} account with the most room for ${riskCategory} clients. Check it before you continue.`
        });
      }
      return selectedMethod;
    } catch (error: any) {
      console.error('Error auto-selecting payment method:', error);
      toast({
        title: "No account picked",
        description: `${String(error?.message || 'Unknown error').replace(/\.$/, '')}. Choose the account from the list.`,
        variant: "destructive"
      });
      return null;
    }
  };

  const handlePaymentReceived = () => {
    setLeadError(null);
    setSaveError(null);
    // A new client's wallet chosen on the client step is the default; the operator confirms it in the form.
    setFinalOrderData(prev => ({
      ...prev,
      walletId: prev.walletId || newClientData.walletId || ''
    }));
    setCurrentStep('final-form');
  };

  /** The picker's answer: the confirmed account becomes the order's receiving account. */
  const handlePaymentStatusChange = (status: string, paymentMethodId?: string, paymentMethod?: any) => {
    const chosen = paymentMethod || availablePaymentMethods.find((m) => m.id === paymentMethodId) || null;
    if (chosen) {
      setSelectedPaymentMethod(chosen);
      setPaymentType(chosen.type === 'Bank Account' ? 'Bank Transfer' : 'UPI');
    }
    if (status === "USER_PAYING") {
      setLeadError(null);
      setCurrentStep('user-paying-status');
    } else if (status === "PAYMENT_DONE") {
      handlePaymentReceived();
    }
  };

  /** Waiting step: show the picker again for another account of the same type. */
  const handleChangeMethod = () => {
    setLeadError(null);
    openMethodPicker(paymentType || 'UPI', selectedPaymentMethod?.id);
  };

  const handleFinalSubmit = () => {
    // Hard stop against double submits (the button's disabled state updates a render later).
    if (submittingRef.current || createSalesOrderMutation.isPending) return;

    // Validate required fields
    if (!finalOrderData.order_number) {
      toast({ title: "Error", description: "Order number is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.stockName) {
      toast({ title: "Error", description: "Stock selection is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.walletId) {
      toast({ title: "Error", description: "Wallet selection is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.price || finalOrderData.price <= 0) {
      toast({ title: "Error", description: "Valid price is required", variant: "destructive" });
      return;
    }

    setSaveError(null);
    submittingRef.current = true;
    createSalesOrderMutation.mutate();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Payment details copied to clipboard" });
  };

  /* ── Presentation (display only: everything below reads the state above) ── */

  const stepMeta = STEP_META[currentStep] ?? STEP_META['order-type'];
  const viewClientName = selectedClient?.name || newClientData.name;
  const viewRiskLevel = selectedClient?.risk_appetite || newClientData.risk_appetite;
  const viewAmount = parseFloat(orderAmount);
  // Who / how much / how, repeated in the header from step 3 on so the operator keeps the context.
  const viewContext = stepMeta.n >= 3
    ? [viewClientName, viewAmount > 0 ? fmtInr(viewAmount) : null, paymentType].filter(Boolean).join(' · ')
    : null;

  /** The receiving account's details with copy buttons (receiving-account step and the waiting step). */
  const renderReceivingAccount = (method: any) => (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {(method.nickname || method.bank_accounts?.account_name) && (
        <div className="border-b border-border bg-muted/30 px-3 py-2 sm:px-4">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {method.nickname || method.bank_accounts?.account_name}
          </p>
          {method.nickname && method.bank_accounts?.account_name && (
            <p className="truncate text-xs text-muted-foreground">{method.bank_accounts.account_name}</p>
          )}
        </div>
      )}
      <div className="divide-y divide-border">
        {method.type === 'UPI' ? (
          <CopyRow
            label="UPI ID"
            value={method.upi_id}
            mono
            onCopy={() => copyToClipboard(method.upi_id)}
          />
        ) : (
          <>
            <CopyRow
              label="Account holder name"
              value={method.bank_accounts?.bank_account_holder_name}
              onCopy={() => copyToClipboard(method.bank_accounts?.bank_account_holder_name || '')}
            />
            <CopyRow
              label="Account number"
              value={method.bank_accounts?.account_number}
              mono
              onCopy={() => copyToClipboard(method.bank_accounts?.account_number || '')}
            />
            <CopyRow
              label="IFSC code"
              value={method.bank_accounts?.IFSC}
              mono
              onCopy={() => copyToClipboard(method.bank_accounts?.IFSC || '')}
            />
            <CopyRow
              label="Bank name"
              value={method.bank_accounts?.bank_name}
              onCopy={() => copyToClipboard(method.bank_accounts?.bank_name || '')}
            />
          </>
        )}
      </div>
    </div>
  );

  const renderCosmos = () => {
    const limit = Number(selectedClient.monthly_limit) || 0;
    const used = Number(selectedClient.current_month_used) || 0;
    const available = selectedClient.monthly_limit - selectedClient.current_month_used;
    const overLimit = parseFloat(orderAmount) > (selectedClient.monthly_limit - selectedClient.current_month_used);
    const usedPct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
    const orderPct = limit > 0 ? Math.min(100 - usedPct, Math.max(0, (viewAmount / limit) * 100)) : 0;
    const afterPct = limit > 0 ? ((used + viewAmount) / limit) * 100 : 0;
    return (
      <Group title="COSMOS limit check" icon={ShieldCheck} bodyClassName="space-y-3">
        <div className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
          <Facts
            cols={3}
            className="grid-cols-3 gap-x-3 sm:gap-x-5"
            items={[
              {
                label: 'Monthly limit',
                value: selectedClient.monthly_limit == null ? '—' : fmtInr(selectedClient.monthly_limit),
                hint: selectedClient.monthly_limit == null ? 'Not set for this client' : undefined,
                className: 'tabular-nums',
              },
              { label: 'Used this month', value: fmtInr(selectedClient.current_month_used), className: 'tabular-nums' },
              { label: 'Available', value: fmtInr(available), className: 'tabular-nums' },
            ]}
          />
          {limit > 0 && (
            <div className="space-y-1.5">
              <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-foreground/10"
                role="img"
                aria-label={`Used ${fmtInr(used)} of ${fmtInr(limit)}; this order adds ${fmtInr(viewAmount)}`}
              >
                <div className="h-full bg-muted-foreground/40" style={{ width: `${usedPct}%` }} />
                <div className={cn("h-full", overLimit ? "bg-warning" : "bg-primary")} style={{ width: `${orderPct}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-3">
                  <LegendDot className="bg-muted-foreground/40" label="Used this month" />
                  <LegendDot className={overLimit ? "bg-warning" : "bg-primary"} label="This order" />
                </span>
                <span className="tabular-nums">{Math.round(afterPct)}% of the limit after this order</span>
              </div>
            </div>
          )}
        </div>
        {overLimit && (
          <Callout tone="warning" title="COSMOS alert">
            This amount is more than the client's available monthly limit. If you continue, the order is saved with a COSMOS alert.
          </Callout>
        )}
      </Group>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'order-type':
        return (
          <div className="space-y-2">
            <OptionRow
              icon={RefreshCw}
              tone="primary"
              title="Repeat order"
              description="Sell to an existing client. You pick the client in the next step."
              selected={orderType === 'repeat'}
              onClick={() => handleOrderTypeSelection('repeat')}
            />
          </div>
        );

      case 'amount-verification':
        return (
          <div className="space-y-5">
            {orderType === 'new' && (
              <Group title="New client" bodyClassName="space-y-3">
                <FieldGrid>
                  <Field label="Client name" htmlFor="new-order-client-name">
                    <Input
                      id="new-order-client-name"
                      value={newClientData.name}
                      onChange={(e) => setNewClientData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter client name"
                    />
                  </Field>
                  <Field label="Phone number" htmlFor="new-order-client-phone">
                    <Input
                      id="new-order-client-phone"
                      value={newClientData.phone}
                      onChange={(e) => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone number"
                    />
                  </Field>
                  <Field label="Wallet" htmlFor="new-order-client-wallet" className="sm:col-span-2">
                    <Select
                      value={newClientData.walletId}
                      onValueChange={(value) => setNewClientData(prev => ({ ...prev, walletId: value }))}
                    >
                      <SelectTrigger id="new-order-client-wallet">
                        <SelectValue placeholder="Select a wallet" />
                      </SelectTrigger>
                      <SelectContent>
                        {wallets?.map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.wallet_name}
                            <span className="text-muted-foreground"> · {fmtAssetQty(wallet.current_balance, 'USDT')}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGrid>
                <Callout tone="info" icon={Info}>
                  New clients get HIGH risk appetite by default.
                </Callout>
              </Group>
            )}

            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-[minmax(0,1fr)_13rem]">
              {orderType === 'repeat' && (
                <Field label="Client" htmlFor="new-order-client" required hint="Type the first letters of a name to jump to it.">
                  <Select
                    defaultValue={selectedClient?.id}
                    onValueChange={(value) => {
                      const client = clients?.find(c => c.id === value);
                      setSelectedClient(client);
                    }}
                  >
                    <SelectTrigger id="new-order-client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.filter((client) => !client.is_deleted).map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          <span className="font-medium">{client.name}</span>
                          <span className="text-muted-foreground"> · ID {client.client_id} · {client.risk_appetite}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Order amount" htmlFor="new-order-amount" required hint="In INR">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>₹</span>
                  <Input
                    id="new-order-amount"
                    type="number"
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value)}
                    placeholder="Enter order amount"
                    className="pl-7 tabular-nums"
                  />
                </div>
              </Field>
            </div>

            {selectedClient && parseFloat(orderAmount) > 0 && renderCosmos()}
          </div>
        );

      case 'payment-type-selection':
        return (
          <div className="space-y-5">
            <Group title="How will the client pay?">
              <div role="radiogroup" aria-label="Payment type" className="grid grid-cols-1 gap-2 sm:grid-cols-2" onKeyDown={moveRadioFocus}>
                <ChoiceCard
                  icon={Smartphone}
                  title="UPI"
                  description="The client pays to a UPI ID."
                  checked={paymentType === 'UPI'}
                  focusable={paymentType !== 'Bank Transfer'}
                  onSelect={() => setPaymentType('UPI')}
                />
                <ChoiceCard
                  icon={Landmark}
                  title="Bank transfer (IMPS/NEFT)"
                  description="The client pays to a bank account."
                  checked={paymentType === 'Bank Transfer'}
                  focusable={paymentType === 'Bank Transfer'}
                  onSelect={() => setPaymentType('Bank Transfer')}
                />
              </div>
            </Group>

            <Group title="Client risk">
              <Facts
                cols={2}
                className="grid-cols-2"
                items={[
                  { label: 'Client risk level', value: viewRiskLevel || '—' },
                  {
                    label: 'Risk category',
                    value: clientRiskCategory,
                    hint: 'Decides which receiving accounts are offered.',
                  },
                ]}
              />
            </Group>
          </div>
        );

      case 'payment-method-display':
        return (
          <div className="space-y-5">
            {methodsLoading && !selectedPaymentMethod ? (
              <PanelSkeleton rows={3} label="Loading receiving accounts" />
            ) : methodsError ? (
              <Callout tone="danger" title="Receiving accounts could not be loaded">
                {methodsError.replace(/\.$/, '')}. Go back and choose the payment type again.
              </Callout>
            ) : selectedPaymentMethod ? (
              <>
                <Group
                  title="Receiving account"
                  actions={<Chip tone="neutral">{selectedPaymentMethod.type}</Chip>}
                >
                  {renderReceivingAccount(selectedPaymentMethod)}
                </Group>

                <Group title="Account limit" bodyClassName="space-y-3">
                  <Facts
                    cols={2}
                    className="grid-cols-2"
                    items={[
                      { label: 'Risk category', value: selectedPaymentMethod.risk_category || '—' },
                      {
                        label: 'Available limit',
                        value: fmtInr(selectedPaymentMethod.payment_limit - selectedPaymentMethod.current_usage),
                        className: 'tabular-nums',
                      },
                    ]}
                  />
                  {Number(selectedPaymentMethod.payment_limit) > 0 && (
                    <div className="space-y-1">
                      <UsageBar
                        used={Number(selectedPaymentMethod.current_usage) || 0}
                        limit={Number(selectedPaymentMethod.payment_limit)}
                        tone={selectedPaymentMethod.current_usage >= selectedPaymentMethod.payment_limit ? 'danger' : 'primary'}
                      />
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Used {fmtInr(selectedPaymentMethod.current_usage)} of {fmtInr(selectedPaymentMethod.payment_limit)}
                      </p>
                    </div>
                  )}
                  {selectedPaymentMethod.current_usage >= selectedPaymentMethod.payment_limit && (
                    <Callout tone="danger" title="Payment limit exceeded">
                      This account has no room left under its limit.
                    </Callout>
                  )}
                </Group>
              </>
            ) : (
              <Callout
                tone="warning"
                title={availablePaymentMethods.length === 0 ? 'No receiving account available' : 'No accounts left to offer'}
              >
                {availablePaymentMethods.length === 0
                  ? `No ${paymentType} payment methods are available for the ${clientRiskCategory} category (client risk level ${viewRiskLevel || '—'}). Ask an admin to add one, or go back and choose another payment type.`
                  : 'Every available account of this type has already been shown. Ask an admin for another account, or go back and choose another payment type.'}
              </Callout>
            )}
          </div>
        );

      case 'alternative-method-choice':
        return (
          <div className="space-y-2">
            <OptionRow
              icon={ArrowLeftRight}
              title="Change payment type"
              description="Go back and choose UPI or bank transfer."
              onClick={handleChangePaymentMethodType}
            />
            <OptionRow
              icon={RefreshCw}
              title="Keep the same type"
              description={`Show the next ${paymentType === 'Bank Transfer' ? 'bank' : 'UPI'} account that still has room under its limit.`}
              onClick={handleKeepSamePaymentType}
            />
          </div>
        );

      case 'action-buttons':
        return (
          <div className="space-y-2">
            <OptionRow
              icon={CheckCircle}
              tone="success"
              title="Payment received"
              description="The client has paid. Fill in the sale details and complete the order."
              onClick={handlePaymentReceived}
            />
            <OptionRow
              icon={Clock}
              tone="info"
              title="User paying"
              description="Confirm the account, then wait here while the client pays. Nothing is saved until the money arrives."
              onClick={handleUserPaying}
            />
            <OptionRow
              icon={RotateCcw}
              title="Alternative payment method"
              description="Switch to the other payment type, or show another account of the same type."
              onClick={handleAlternativePaymentMethod}
            />
            <OptionRow
              icon={X}
              tone="danger"
              title="Order cancelled"
              description="Save the client and amount as a lead for follow-up."
              busy={createLeadMutation.isPending}
              onClick={handleOrderCancelled}
            />
            {leadError && (
              <Callout tone="danger" title="Lead not saved">
                {leadError}
              </Callout>
            )}
          </div>
        );

      case 'user-paying-status':
        return (
          <div className="space-y-5">
            <Group
              title="Waiting for payment"
              icon={Clock}
              actions={selectedPaymentMethod ? <Chip tone="neutral">{selectedPaymentMethod.type}</Chip> : undefined}
              bodyClassName="space-y-3"
            >
              <Facts
                cols={2}
                className="grid-cols-2"
                items={[
                  { label: 'Client', value: viewClientName || '—' },
                  { label: 'Amount', value: viewAmount > 0 ? fmtInr(viewAmount) : '—', className: 'tabular-nums' },
                ]}
              />
              {selectedPaymentMethod ? (
                renderReceivingAccount(selectedPaymentMethod)
              ) : (
                <Callout tone="warning" title="No receiving account">
                  Use Change method to pick the account the client pays into.
                </Callout>
              )}
            </Group>

            <div className="space-y-2" role="group" aria-label="What happened with the payment">
              <OptionRow
                icon={CheckCircle}
                tone="success"
                title="Payment received"
                description="The money has arrived. Fill in the sale details and complete the order."
                onClick={handlePaymentReceived}
              />
              <OptionRow
                icon={ArrowLeftRight}
                title="Change method"
                description="The client wants to pay into another account. Pick it from the list."
                onClick={handleChangeMethod}
              />
              <OptionRow
                icon={X}
                tone="danger"
                title="Order cancelled"
                description="The client won't pay. Save the client and amount as a lead for follow-up."
                busy={createLeadMutation.isPending}
                onClick={handleOrderCancelled}
              />
              {leadError && (
                <Callout tone="danger" title="Lead not saved">
                  {leadError}
                </Callout>
              )}
            </div>
          </div>
        );

      case 'final-form': {
        const stockProduct = products?.find((p) => p.name === finalOrderData.stockName);
        const formWallet = wallets?.find((w) => w.id === finalOrderData.walletId);
        const formAsset = String(stockProduct?.code || 'USDT').toUpperCase();
        // Platform fee as the order will charge it: the wallet's fee % of the quantity (Manual entry rule).
        const feePct = formWallet?.is_fee_enabled ? Number(formWallet.fee_percentage || 0) : 0;
        const feeAmount = formWallet && finalOrderData.price > 0
          ? platformFeeFor(finalOrderData.quantity, { id: formWallet.id, name: formWallet.wallet_name, feePercentage: formWallet.fee_percentage, feeEnabled: formWallet.is_fee_enabled }).amount
          : 0;
        return (
          <div className="space-y-5">
            {saveError && (
              <Callout tone="danger" title="Order not saved">
                {saveError}
              </Callout>
            )}

            <Group title="Client">
              <Facts
                cols={3}
                items={[
                  { label: 'Customer name', value: selectedClient?.name || newClientData.name || '—' },
                  { label: 'Contact number', value: selectedClient?.phone || newClientData.phone || '—', mono: true },
                  { label: 'State', value: selectedClient?.state || '—' },
                ]}
              />
            </Group>

            <Group title="Sale">
              <FieldGrid>
                <Field label="Order number" htmlFor="new-order-number" required>
                  <Input
                    id="new-order-number"
                    value={finalOrderData.order_number}
                    onChange={(e) => setFinalOrderData(prev => ({ ...prev, order_number: e.target.value }))}
                    placeholder="Enter order number"
                    className="font-mono text-[13px] placeholder:font-sans"
                  />
                </Field>

                <Field label="Stock" htmlFor="new-order-stock" required>
                  <Select
                    value={finalOrderData.stockName}
                    onValueChange={(value) => setFinalOrderData(prev => ({ ...prev, stockName: value }))}
                  >
                    <SelectTrigger id="new-order-stock">
                      <SelectValue placeholder="Select stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((product) => (
                        <SelectItem key={product.id} value={product.name}>
                          {product.name}
                          <span className="text-muted-foreground">
                            {product.code && product.code !== product.name ? ` · ${product.code}` : ''} · {fmtQty(product.current_stock_quantity)} {product.unit_of_measurement} available
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Wallet" htmlFor="new-order-wallet" required>
                  <Select
                    value={finalOrderData.walletId}
                    onValueChange={(value) => setFinalOrderData(prev => ({ ...prev, walletId: value }))}
                  >
                    <SelectTrigger id="new-order-wallet">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets?.filter(w => w.is_active).map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.wallet_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Price per unit" htmlFor="new-order-price" required hint="In INR">
                  <Input
                    id="new-order-price"
                    type="number"
                    step="0.01"
                    value={finalOrderData.price}
                    onChange={(e) => setFinalOrderData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter price"
                    className="tabular-nums"
                  />
                </Field>

              </FieldGrid>
            </Group>

            <Group title="Summary" boxed bodyClassName="py-1.5 sm:py-2">
              <SummaryRow label="Amount of sales" value={fmtInr(orderAmount)} />
              <SummaryRow
                label="Net quantity received"
                hint="Amount ÷ price per unit, worked out for you"
                value={fmtAssetQty(finalOrderData.quantity, stockProduct?.code, 6)}
              />
              <SummaryRow
                label="Platform fee"
                hint={feePct > 0 ? `${feePct}% of the quantity, charged by this wallet` : formWallet ? 'This wallet charges no platform fee' : 'Set by the wallet you pick'}
                value={feePct > 0 ? (feeAmount > 0 ? `${feeAmount.toFixed(6)} USDT` : '—') : formWallet ? 'None' : '—'}
              />
              {feeAmount > 0 && formAsset === 'USDT' && (
                <SummaryRow
                  label="Total deducted"
                  hint="Net quantity + platform fee"
                  value={`${(finalOrderData.quantity + feeAmount).toFixed(6)} USDT`}
                />
              )}
              <SummaryRow
                label="Payment received in"
                value={<span className="font-sans">{selectedPaymentMethod?.bank_accounts?.account_name || '—'}</span>}
              />
            </Group>

            <Field label="Order description" htmlFor="new-order-description" hint="Optional">
              <Textarea
                id="new-order-description"
                value={finalOrderData.description}
                onChange={(e) => setFinalOrderData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter order description"
                rows={3}
              />
            </Field>
          </div>
        );
      }

      default:
        return null;
    }
  };

  /** The step's main action, shown in the footer next to Back (same handlers and disabled rules as before). */
  const renderPrimaryAction = () => {
    switch (currentStep) {
      case 'amount-verification':
        return (
          <Button
            onClick={handleAmountVerification}
            disabled={!orderAmount || (orderType === 'repeat' && !selectedClient) || (orderType === 'new' && !newClientData.name)}
          >
            <span>
              Continue to payment<span className="hidden sm:inline">{" method"}</span>
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        );
      case 'payment-type-selection':
        return (
          <Button onClick={handlePaymentTypeSelection} disabled={!paymentType}>
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        );
      case 'payment-method-display':
        return (
          <Button onClick={handleContinueToActions} disabled={!selectedPaymentMethod}>
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        );
      case 'final-form':
        return (
          <Button
            onClick={handleFinalSubmit}
            disabled={!finalOrderData.order_number || !finalOrderData.stockName || !finalOrderData.walletId || !finalOrderData.price || createSalesOrderMutation.isPending}
          >
            {createSalesOrderMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating order…
              </>
            ) : (
              "Complete sales order"
            )}
          </Button>
        );
      default:
        return null;
    }
  };

  // Final form: what still blocks "Complete sales order" (the same four checks as its disabled rule).
  const stillNeeded = currentStep === 'final-form'
    ? [
        !finalOrderData.order_number && 'order number',
        !finalOrderData.stockName && 'stock',
        !finalOrderData.walletId && 'wallet',
        (!finalOrderData.price || finalOrderData.price <= 0) && 'a valid price',
      ].filter(Boolean) as string[]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("lg")}>
        <DialogHead
          icon={ShoppingCart}
          title="New sales order"
          description={
            currentStep === 'payment-method-display' && !selectedPaymentMethod && !methodsLoading
              ? (methodsError ? 'The receiving accounts could not be loaded.' : 'There is no receiving account to share for this payment type.')
              : stepMeta.hint
          }
          meta={<StepProgress step={stepMeta.n} total={STEP_COUNT} label={stepMeta.label} context={viewContext} />}
        />

        <DialogBody>
          {renderCurrentStep()}
        </DialogBody>

        <DialogFoot start={stillNeeded.length > 0 ? <span>Still needed: {listPhrase(stillNeeded)}</span> : undefined}>
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep === 'order-type') {
                onOpenChange(false);
              } else if (currentStep === 'user-paying-status') {
                setCurrentStep('action-buttons');
              } else {
                const steps: FlowStep[] = ['order-type', 'amount-verification', 'payment-type-selection', 'payment-method-display', 'action-buttons', 'final-form'];
                const currentIndex = steps.indexOf(currentStep);
                if (currentIndex > 0) {
                  setCurrentStep(steps[currentIndex - 1]);
                }
              }
            }}
          >
            {currentStep === 'order-type' ? 'Cancel' : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Back
              </>
            )}
          </Button>
          {renderPrimaryAction()}
        </DialogFoot>

        {/* Payment Method Selection Dialog */}
        <PaymentMethodSelectionDialog
          open={paymentMethodDialogOpen}
          onOpenChange={setPaymentMethodDialogOpen}
          orderAmount={parseFloat(orderAmount) || 0}
          clientName={selectedClient?.name || newClientData.name}
          orderId=""
          riskCategory={clientRiskCategory}
          paymentType={pickerType}
          selectedMethodId={pickerMethodId}
          onStatusChange={handlePaymentStatusChange}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ── Presentation helpers (private to this file; candidates for the orders-ui kit) ── */

const STEP_COUNT = 6;

/** Step number, short name and one-line instruction for each step of the flow. */
const STEP_META: Record<FlowStep, { n: number; label: string; hint: string }> = {
  'order-type': { n: 1, label: 'Order type', hint: 'Choose the kind of order to start.' },
  'amount-verification': {
    n: 2,
    label: 'Client and amount',
    hint: "Pick the client and enter the amount. It is checked against the client's COSMOS monthly limit.",
  },
  'payment-type-selection': { n: 3, label: 'Payment type', hint: 'Choose how the client will pay.' },
  'payment-method-display': { n: 4, label: 'Receiving account', hint: 'Share this receiving account with the client.' },
  'action-buttons': { n: 5, label: 'Payment outcome', hint: 'What happened with the payment?' },
  'alternative-method-choice': {
    n: 5,
    label: 'Alternative payment method',
    hint: 'Switch the payment type, or show another account of the same type.',
  },
  'final-form': { n: 6, label: 'Sale details', hint: 'Fill in the sale details to complete the order.' },
  'user-paying-status': { n: 5, label: 'User paying', hint: "Waiting for the client's payment." },
};

/**
 * The kit's Section, with its heading kept at 11px on phones: a global mobile rule in index.css
 * forces every h3 to 16px !important, which turns the small uppercase section labels into shouting.
 */
function Group({ title, ...rest }: ComponentProps<typeof Section>) {
  return <Section {...rest} title={title ? <span className="!text-[11px] !leading-4">{title}</span> : undefined} />;
}

/** "a", "a and b", "a, b and c" */
function listPhrase(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Step 2 of 6 · Client and amount" with a segmented bar; optional context on the right. */
function StepProgress({ step, total, label, context }: { step: number; total: number; label: string; context?: string | null }) {
  return (
    <div className="w-full min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span className="font-medium text-foreground">
          Step {step} of {total}
          <span className="mx-1 text-muted-foreground">·</span>
          {label}
        </span>
        {context && <span className="min-w-0 truncate text-muted-foreground">{context}</span>}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        role="progressbar"
        aria-label="New order progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${total}: ${label}`}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={cn("h-1 rounded-full transition-colors", i < step ? "bg-primary" : "bg-foreground/10")} />
        ))}
      </div>
    </div>
  );
}

type OptionTone = "neutral" | "primary" | "success" | "info" | "danger";

const OPTION_ICON_TONE: Record<OptionTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  danger: "bg-destructive/10 text-destructive",
};

/** A large choice that acts immediately: icon, title, one-line explanation. */
function OptionRow({
  icon: Icon,
  title,
  description,
  onClick,
  tone = "neutral",
  selected,
  busy,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  onClick: () => void;
  tone?: OptionTone;
  selected?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={selected ? "selected" : undefined}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left shadow-[var(--shadow-xs)] transition-colors sm:px-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        tone === "danger" ? "hover:border-destructive/40 hover:bg-destructive/5" : "hover:border-ring/40 hover:bg-muted/40",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", OPTION_ICON_TONE[tone])} aria-hidden>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] font-semibold leading-5", tone === "danger" ? "text-destructive" : "text-foreground")}>{title}</span>
        <span className="block text-xs leading-[1.125rem] text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" aria-hidden />
    </button>
  );
}

/** One option of a radio group shown as a card (selection only; nothing happens until Continue). */
function ChoiceCard({
  icon: Icon,
  title,
  description,
  checked,
  focusable,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  checked: boolean;
  focusable: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-start gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors sm:px-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        checked ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-ring/40 hover:bg-muted/40",
      )}
    >
      <span
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-5 text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-background",
        )}
        aria-hidden
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Arrow keys move between the radios of a group and select, like native radio buttons. */
function moveRadioFocus(e: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const i = radios.indexOf(document.activeElement as HTMLElement);
  if (i === -1) return;
  e.preventDefault();
  const next = radios[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
}

/** Label over value with a copy button (the button runs the caller's own copy handler). */
function CopyRow({ label, value, mono, onCopy }: { label: string; value?: ReactNode; mono?: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
        <div className={cn("mt-0.5 break-all text-sm font-medium text-foreground", mono && "font-mono text-[13px] tracking-tight")}>{value || "—"}</div>
      </div>
      <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={onCopy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
        <Copy className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Copy</span>
      </Button>
    </div>
  );
}

/** Thin bar for usage against a limit. */
function UsageBar({ used, limit, tone = "primary" }: { used: number; limit: number; tone?: "primary" | "danger" }) {
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`${Math.round(pct)}% of the limit used`}>
      <div className={cn("h-full rounded-full", tone === "danger" ? "bg-destructive" : "bg-primary/70")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}
