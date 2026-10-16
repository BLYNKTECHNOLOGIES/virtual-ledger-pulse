import { useState, useEffect } from "react";
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
import { UserPayingStatusDialog } from "./UserPayingStatusDialog";
import { fetchActiveWalletsWithLedgerUsdtBalance, fetchWalletLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
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
  const [usdtAmount, setUsdtAmount] = useState(0);
  const [cosmosAlert, setCosmosAlert] = useState(false);
  const [paymentType, setPaymentType] = useState<'UPI' | 'Bank Transfer' | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<any[]>([]);
  const [usedPaymentMethods, setUsedPaymentMethods] = useState<string[]>([]);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [userPayingDialogOpen, setUserPayingDialogOpen] = useState(false);
  const [pendingSalesOrder, setPendingSalesOrder] = useState<any>(null);
  // Generate unique order number - only used as fallback if user doesn't provide one
  const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ORD-${timestamp}-${random}`;
  };

  const [finalOrderData, setFinalOrderData] = useState({
    order_number: "", // Empty - user must enter order number
    platform: '', 
    quantity: 1, 
    platform_fees: 0,
    description: '', 
    stockName: '', 
    warehouseId: '', 
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

  const getRiskCategoryFromAppetite = (appetite: string) => {
    switch (appetite) {
      case 'LOW': return 'Low Risk';
      case 'MEDIUM': return 'Medium Risk';
      case 'HIGH': return 'High Risk';
      case 'NONE': return 'No Risk';
      default: return 'High Risk';
    }
  };

  // Fetch payment methods when payment type is selected
  const fetchPaymentMethods = async () => {
    if (!paymentType) return;
    
    const riskLevel = selectedClient?.risk_appetite || newClientData.risk_appetite;
    const riskCategory = getRiskCategoryFromAppetite(riskLevel);
    
    let query = supabase
      .from('sales_payment_methods')
      .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name), payment_gateway')
      .eq('is_active', true)
      .eq('risk_category', riskCategory);

    if (paymentType) {
      query = query.eq('type', paymentType === 'UPI' ? 'UPI' : 'Bank Account');
    }

    const { data, error } = await query;
    if (error) throw error;
    
    setAvailablePaymentMethods(data || []);
    
    // Find next available payment method that hasn't been used
    if (data && data.length > 0) {
      const availableMethod = data.find(method => 
        method.current_usage < method.payment_limit && 
        !usedPaymentMethods.includes(method.id)
      );
      setSelectedPaymentMethod(availableMethod || null);
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
      const calculatedQuantity = amount / finalOrderData.price;
      setFinalOrderData(prev => ({ ...prev, quantity: calculatedQuantity }));
    }
  }, [orderAmount, finalOrderData.price]);

  // Auto-calculate USDT amount when order amount changes
  useEffect(() => {
    const amount = parseFloat(orderAmount) || 0;
    setUsdtAmount(amount); // Default USDT amount to order amount
  }, [orderAmount]);

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (leadData: any) => {
      const { data, error } = await supabase.from('leads').insert([leadData]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Order Cancelled", description: "Record moved to Leads for follow-up" });
      resetFlow();
      onOpenChange(false);
    }
  });

  // Create sales order mutation with wallet deduction
  const createSalesOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get the selected product and wallet
      const selectedProduct = products?.find(p => p.name === finalOrderData.stockName);
      const walletId = selectedClient?.walletId || newClientData.walletId;

      // Validate stock before creating sales order
      if (selectedProduct && finalOrderData.quantity) {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('name, current_stock_quantity')
          .eq('id', selectedProduct.id)
          .single();

        if (productError) throw productError;

        if (!product) {
          throw new Error('Product not found');
        }

        const netQuantity = finalOrderData.quantity;
        const platformFees = finalOrderData.platform_fees || 0;
        const totalQuantityNeeded = netQuantity + platformFees;

        if (product.current_stock_quantity < totalQuantityNeeded) {
          throw new Error(
            `Insufficient stock. Available: ${product.current_stock_quantity}, Required: ${totalQuantityNeeded} (${netQuantity} + ${platformFees} fees) for product: ${product.name}`
          );
        }
      }

      // Validate wallet balance for USDT transactions
      if (walletId && usdtAmount > 0) {
        const walletName = wallets?.find((w) => w.id === walletId)?.wallet_name || 'Selected wallet';
        const walletBalance = await fetchWalletLedgerUsdtBalance(walletId);

        const netQuantity = finalOrderData.quantity;
        const platformFees = finalOrderData.platform_fees || 0;
        const totalUsdtNeeded = netQuantity + platformFees;

        if (walletBalance < totalUsdtNeeded) {
          throw new Error(
            `Insufficient wallet balance. Available: ${walletBalance}, Required: ${totalUsdtNeeded} (${netQuantity} + ${platformFees} fees) in wallet: ${walletName}`
          );
        }
      }
      
      // Get platform from wallet if available
      let platform = finalOrderData.platform;
      if (walletId && wallets) {
        const selectedWallet = wallets.find(w => w.id === walletId);
        if (selectedWallet) {
          platform = selectedWallet.wallet_name.split(' ')[0]; // Extract platform from wallet name
        }
      }
      
      // Prepare the complete sales order data
      const salesOrderData = {
        order_number: finalOrderData.order_number,
        client_name: selectedClient?.name || newClientData.name,
        client_phone: selectedClient?.phone || newClientData.phone,
        wallet_id: walletId || null,
        platform: platform || null,
        usdt_amount: usdtAmount,
        platform_fees: finalOrderData.platform_fees || 0,
        product_id: selectedProduct?.id || null,
        warehouse_id: finalOrderData.warehouseId,
        quantity: finalOrderData.quantity,
        price_per_unit: finalOrderData.price,
        total_amount: parseFloat(orderAmount) || 0,
        sales_payment_method_id: selectedPaymentMethod?.id,
        payment_status: 'COMPLETED',
        status: 'COMPLETED',
        order_date: new Date().toISOString().split('T')[0],
        description: finalOrderData.description,
        cosmos_alert: cosmosAlert,
        risk_level: selectedClient?.risk_appetite || newClientData.risk_appetite,
        created_by: user?.id
      };


      // First create the sales order
      const { data: salesOrder, error: salesError } = await supabase
        .from('sales_orders')
        .insert([salesOrderData])
        .select()
        .single();
      
      if (salesError) {
        console.error('Sales order creation error:', salesError);
        throw salesError;
      }


      // Process wallet deduction if USDT amount is specified and wallet is selected
      if (walletId && usdtAmount > 0) {
        try {
          const netQuantity = finalOrderData.quantity;
          const platformFees = finalOrderData.platform_fees || 0;
          
          // Deduct only the quantity sold from wallet (not including fees)
          const { error: walletError } = await supabase.rpc(
            'process_sales_order_wallet_deduction',
            {
              sales_order_id: salesOrder.id,
              wallet_id: walletId,
              usdt_amount: netQuantity  // Only the quantity sold, fees are separate
            }
          );

          if (walletError) {
            console.error('Wallet deduction error:', walletError);
            throw new Error(`Wallet deduction failed: ${walletError.message}`);
          }

          
          // Process platform fee deduction separately (if applicable)
          if (platformFees > 0) {
            
            const { data: feeResult, error: feeError } = await supabase.rpc('process_platform_fee_deduction', {
              p_order_id: salesOrder.id,
              p_order_type: 'SALES_ORDER',
              p_wallet_id: walletId,
              p_fee_amount: platformFees,
              p_order_number: finalOrderData.order_number
            });
            
            if (feeError) {
              console.error('Error processing platform fee:', feeError);
              // Don't throw - the main order was created, just log the fee error
              console.warn('⚠️ Platform fee deduction failed, but order was created');
            } else {
            }
            
            // Update the sales order with fee details
            const selectedWallet = wallets?.find(w => w.id === walletId);
            const feePercentage = Number(selectedWallet?.fee_percentage || 0);
            
            await supabase
              .from('sales_orders')
              .update({ 
                fee_amount: platformFees,
                fee_percentage: feePercentage
              })
              .eq('id', salesOrder.id);
          }
        } catch (walletError) {
          // If wallet deduction fails, we should probably handle this more gracefully
          console.error('Error processing wallet deduction:', walletError);
          throw walletError;
        }
      }

      // Bank transaction is handled automatically by database trigger: create_sales_bank_transaction
      // Only update payment method usage here for direct payment methods
      if (selectedPaymentMethod?.bank_account_id && !selectedPaymentMethod?.payment_gateway) {
        const { error: usageError } = await supabase
          .from('sales_payment_methods')
          .update({
            current_usage: selectedPaymentMethod.current_usage + (parseFloat(orderAmount) || 0),
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedPaymentMethod.id);

        if (usageError) {
          console.error('Error updating payment method usage:', usageError);
        }
      }


      return salesOrder;
    },
     onSuccess: async (data) => {
       
       // Check if client exists - if not, create an onboarding approval request for new buyers
       try {
         const clientName = selectedClient?.name || newClientData.name;
         const clientPhone = selectedClient?.phone || newClientData.phone;
         
         const { data: existingClient } = await supabase
           .from('clients')
           .select('id, name')
           .ilike('name', clientName.trim())
           .eq('is_deleted', false)
           .limit(1)
           .maybeSingle();
         
         // If client doesn't exist, create an onboarding approval request
         if (!existingClient) {
           const { error: approvalError } = await supabase
             .from('client_onboarding_approvals')
             .insert({
               sales_order_id: data.id,
               client_name: clientName,
               client_phone: clientPhone || null,
               order_amount: parseFloat(orderAmount) || 0,
               order_date: new Date().toISOString().split('T')[0],
               approval_status: 'PENDING'
             });
 
           if (approvalError) {
             console.error('⚠️ Failed to create approval request:', approvalError);
           } else {
           }
          } else {
            // Update client phone/state from order data
            const { updateClientFromOrder } = await import('@/utils/updateClientFromOrder');
            await updateClientFromOrder({
              clientId: existingClient.id,
              phone: clientPhone,
            });
          }
       } catch (approvalCheckError) {
         console.error('Error checking for existing client:', approvalCheckError);
       }
       
      toast({ 
        title: "Success", 
        description: "Sales order created successfully with wallet deduction and all linked records updated" 
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
      resetFlow();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Sales order creation failed:', error);
      toast({ 
        title: "Error", 
        description: `Failed to create sales order: ${error.message}`,
        variant: "destructive"
      });
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
    setFinalOrderData({ order_number: generateOrderNumber(), platform: '', quantity: 1, platform_fees: 0, description: '', stockName: '', warehouseId: '', price: 0 });
  };

  const handleOrderTypeSelection = (type: 'repeat' | 'new') => {
    setOrderType(type);
    setCurrentStep('amount-verification');
  };

  const handleAmountVerification = () => {
    const amount = parseFloat(orderAmount) || 0;
    if (selectedClient && amount > (selectedClient.monthly_limit - selectedClient.current_month_used)) {
      setCosmosAlert(true);
    }
    setCurrentStep('payment-type-selection');
  };

  const handlePaymentTypeSelection = () => {
    setCurrentStep('payment-method-display');
  };

  const handleContinueToActions = () => {
    setCurrentStep('action-buttons');
  };

  const handleOrderCancelled = () => {
    const leadData = {
      name: selectedClient?.name || newClientData.name,
      contact_number: selectedClient?.phone || newClientData.phone,
      estimated_order_value: parseFloat(orderAmount) || 0,
      status: 'NEW',
      source: 'Cancelled Sales Order',
      description: `Cancelled order for amount ₹${orderAmount}`
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
        method.current_usage < method.payment_limit && 
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

  const handleUserPaying = async () => {
    const riskLevel = selectedClient?.risk_appetite || newClientData.risk_appetite;
    const riskCategory = getRiskCategoryFromAppetite(riskLevel);
    
    // Auto-select payment method based on smart logic
    await autoSelectPaymentMethod(riskCategory);
    
    // Open dialog with auto-selected method
    setPaymentMethodDialogOpen(true);
  };

  const autoSelectPaymentMethod = async (riskCategory: string) => {
    try {
      // Fetch available payment methods for the risk category
      const { data: methods, error } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(*)')
        .eq('is_active', true)
        .eq('risk_category', riskCategory)
        .gt('payment_limit', 'current_usage');

      if (error) throw error;

      if (methods && methods.length > 0) {
        // Smart selection logic:
        // 1. Prefer UPI methods for speed
        // 2. Then prefer methods with highest available balance
        // 3. Avoid recently used methods
        
        const upiMethods = methods.filter(m => m.type === 'UPI');
        const bankMethods = methods.filter(m => m.type === 'Bank Account');
        
        let selectedMethod = null;
        
        if (upiMethods.length > 0) {
          // Select UPI method with highest available balance
          selectedMethod = upiMethods.reduce((best, current) => 
            (current.payment_limit - current.current_usage) > (best.payment_limit - best.current_usage) 
              ? current : best
          );
          setPaymentType('UPI');
        } else if (bankMethods.length > 0) {
          // Select bank method with highest available balance
          selectedMethod = bankMethods.reduce((best, current) => 
            (current.payment_limit - current.current_usage) > (best.payment_limit - best.current_usage) 
              ? current : best
          );
          setPaymentType('Bank Transfer');
        }

        if (selectedMethod) {
          setSelectedPaymentMethod(selectedMethod);
          setAvailablePaymentMethods(methods);
          
          toast({ 
            title: "Payment Method Auto-Selected", 
            description: `${selectedMethod.type} method selected based on availability and risk level` 
          });
        }
      }
    } catch (error) {
      console.error('Error auto-selecting payment method:', error);
      toast({ 
        title: "Error", 
        description: "Failed to auto-select payment method", 
        variant: "destructive" 
      });
    }
  };

  const handlePaymentReceived = () => {
    setFinalOrderData(prev => ({
      ...prev,
      walletId: selectedClient?.walletId || newClientData.walletId || ''
    }));
    setCurrentStep('final-form');
  };

  const handlePaymentStatusChange = async (status: string, paymentMethodId?: string) => {
    if (status === "USER_PAYING") {
      // Create pending sales order and close dialog
      await createPendingSalesOrder(paymentMethodId);
      // Refetch sales orders to show the new order immediately
      await queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      resetFlow();
      onOpenChange(false);
    } else if (status === "PAYMENT_DONE") {
      // Update order to completed and proceed to final form
      if (pendingSalesOrder) {
        await updateSalesOrderStatus(pendingSalesOrder.id, "PAYMENT_DONE", paymentMethodId);
        setCurrentStep('final-form');
      }
    } else if (status === "ORDER_CANCELLED") {
      // Handle cancellation
      handleOrderCancelled();
    }
  };

  const handleUserPayingStatusChange = async (status: string) => {
    if (!pendingSalesOrder) return;

    if (status === "PAYMENT_DONE") {
      await updateSalesOrderStatus(pendingSalesOrder.id, "PAYMENT_DONE");
      setUserPayingDialogOpen(false);
      setCurrentStep('final-form');
    } else if (status === "ORDER_CANCELLED") {
      await updateSalesOrderStatus(pendingSalesOrder.id, "ORDER_CANCELLED");
      handleOrderCancelled();
    }
  };

  const createPendingSalesOrder = async (paymentMethodId?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get selected wallet ID
      const walletId = selectedClient?.walletId || newClientData.walletId;
      
      const salesOrderData = {
        order_number: finalOrderData.order_number,
        client_name: selectedClient?.name || newClientData.name,
        client_phone: selectedClient?.phone || newClientData.phone,
        wallet_id: walletId || null,
        total_amount: parseFloat(orderAmount) || 0,
        usdt_amount: usdtAmount || parseFloat(orderAmount) || 0, // Default USDT amount to order amount
        quantity: 1,
        price_per_unit: parseFloat(orderAmount) || 0,
        sales_payment_method_id: paymentMethodId,
        payment_status: 'USER_PAYING',
        status: 'PENDING',
        order_date: new Date().toISOString().split('T')[0],
        description: `Pending order - awaiting payment confirmation`,
        cosmos_alert: cosmosAlert,
        risk_level: selectedClient?.risk_appetite || newClientData.risk_appetite,
        created_by: user?.id
      };

      const { data: salesOrder, error } = await supabase
        .from('sales_orders')
        .insert([salesOrderData])
        .select()
        .single();

      if (error) throw error;

      setPendingSalesOrder(salesOrder);
      toast({ title: "Order Created", description: "Order created with USER_PAYING status" });
      
    } catch (error) {
      console.error('Error creating pending sales order:', error);
      toast({ title: "Error", description: "Failed to create order", variant: "destructive" });
    }
  };

  const updateSalesOrderStatus = async (orderId: string, status: string, paymentMethodId?: string) => {
    try {
      const updateData: any = {
        payment_status: status,
        updated_at: new Date().toISOString()
      };

      if (paymentMethodId) {
        updateData.sales_payment_method_id = paymentMethodId;
      }

      if (status === "PAYMENT_DONE") {
        updateData.status = "COMPLETED";
      }

      const { error } = await supabase
        .from('sales_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      toast({ title: "Status Updated", description: `Order status updated to ${status.replace('_', ' ')}` });
      
    } catch (error) {
      console.error('Error updating sales order status:', error);
      toast({ title: "Error", description: "Failed to update order status", variant: "destructive" });
    }
  };

  const handleFinalSubmit = () => {

    // Validate required fields
    if (!finalOrderData.order_number) {
      toast({ title: "Error", description: "Order number is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.stockName) {
      toast({ title: "Error", description: "Stock selection is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.warehouseId) {
      toast({ title: "Error", description: "Warehouse selection is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.price || finalOrderData.price <= 0) {
      toast({ title: "Error", description: "Valid price is required", variant: "destructive" });
      return;
    }

    createSalesOrderMutation.mutate({});
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
                      {clients?.map((client) => (
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
                    value: getRiskCategoryFromAppetite(viewRiskLevel),
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
            {selectedPaymentMethod ? (
              <>
                <Group
                  title="Receiving account"
                  actions={<Chip tone="neutral">{selectedPaymentMethod.type}</Chip>}
                >
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    {(selectedPaymentMethod.nickname || selectedPaymentMethod.bank_accounts?.account_name) && (
                      <div className="border-b border-border bg-muted/30 px-3 py-2 sm:px-4">
                        <p className="truncate text-[13px] font-semibold text-foreground">
                          {selectedPaymentMethod.nickname || selectedPaymentMethod.bank_accounts?.account_name}
                        </p>
                        {selectedPaymentMethod.nickname && selectedPaymentMethod.bank_accounts?.account_name && (
                          <p className="truncate text-xs text-muted-foreground">{selectedPaymentMethod.bank_accounts.account_name}</p>
                        )}
                      </div>
                    )}
                    <div className="divide-y divide-border">
                      {selectedPaymentMethod.type === 'UPI' ? (
                        <CopyRow
                          label="UPI ID"
                          value={selectedPaymentMethod.upi_id}
                          mono
                          onCopy={() => copyToClipboard(selectedPaymentMethod.upi_id)}
                        />
                      ) : (
                        <>
                          <CopyRow
                            label="Account holder name"
                            value={selectedPaymentMethod.bank_accounts?.bank_account_holder_name}
                            onCopy={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.bank_account_holder_name || '')}
                          />
                          <CopyRow
                            label="Account number"
                            value={selectedPaymentMethod.bank_accounts?.account_number}
                            mono
                            onCopy={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.account_number || '')}
                          />
                          <CopyRow
                            label="IFSC code"
                            value={selectedPaymentMethod.bank_accounts?.IFSC}
                            mono
                            onCopy={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.IFSC || '')}
                          />
                          <CopyRow
                            label="Bank name"
                            value={selectedPaymentMethod.bank_accounts?.bank_name}
                            onCopy={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.bank_name || '')}
                          />
                        </>
                      )}
                    </div>
                  </div>
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
                  ? `No ${paymentType} payment methods are available for the ${selectedClient?.risk_appetite || newClientData.risk_appetite} risk level. Ask an admin to add one, or go back and choose another payment type.`
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
              description="Pick the account, then save the order as User paying while the client pays."
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
          </div>
        );

      case 'final-form': {
        const stockProduct = products?.find((p) => p.name === finalOrderData.stockName);
        return (
          <div className="space-y-5">
            <Group title="Client">
              <Facts
                cols={3}
                items={[
                  { label: 'Customer name', value: selectedClient?.name || newClientData.name || '—' },
                  { label: 'Contact number', value: selectedClient?.phone || newClientData.phone || '—', mono: true },
                  { label: 'Wallet address', value: selectedClient?.walletId || newClientData.walletId || '—', mono: true },
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
                    value={finalOrderData.warehouseId}
                    onValueChange={(value) => setFinalOrderData(prev => ({ ...prev, warehouseId: value }))}
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

                <Field
                  label="Platform fees (USDT)"
                  htmlFor="new-order-fees"
                  hint={finalOrderData.platform_fees > 0 ? 'Fees will be deducted from total quantity' : undefined}
                >
                  <Input
                    id="new-order-fees"
                    type="number"
                    step="0.01"
                    value={finalOrderData.platform_fees}
                    onChange={(e) => setFinalOrderData(prev => ({ ...prev, platform_fees: parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter platform fees"
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
              {finalOrderData.platform_fees > 0 && (
                <SummaryRow
                  label="Total deducted"
                  hint="Net quantity + platform fees"
                  value={`${(finalOrderData.quantity + finalOrderData.platform_fees).toFixed(6)} USDT`}
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
            disabled={!finalOrderData.order_number || !finalOrderData.stockName || !finalOrderData.warehouseId || !finalOrderData.price || createSalesOrderMutation.isPending}
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
        !finalOrderData.warehouseId && 'wallet',
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
            currentStep === 'payment-method-display' && !selectedPaymentMethod
              ? 'There is no receiving account to share for this payment type.'
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
          riskCategory={getRiskCategoryFromAppetite(selectedClient?.risk_appetite || newClientData.risk_appetite)}
          paymentType={paymentType || 'UPI'}
          onStatusChange={handlePaymentStatusChange}
        />

        {/* User Paying Status Dialog */}
        <UserPayingStatusDialog
          open={userPayingDialogOpen}
          onOpenChange={setUserPayingDialogOpen}
          clientName={selectedClient?.name || newClientData.name}
          orderAmount={parseFloat(orderAmount) || 0}
          onStatusChange={handleUserPayingStatusChange}
          onAlternativeMethod={() => {
            setUserPayingDialogOpen(false);
            setPaymentMethodDialogOpen(true);
          }}
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
