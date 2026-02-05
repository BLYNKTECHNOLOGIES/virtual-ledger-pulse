import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductSelectionSection } from "./ProductSelectionSection";
import { SupplierAutocomplete } from "./SupplierAutocomplete";
import { createSellerClient } from "@/utils/clientIdGenerator";
import { useUSDTRate, calculatePlatformFeeInUSDT } from "@/hooks/useUSDTRate";
import { useAverageCost } from "@/hooks/useAverageCost";
import { TrendingUp, Loader2 } from "lucide-react";
import { recordActionTiming } from "@/lib/purchase-action-timing";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, getCurrentUserId } from "@/lib/system-action-logger";
import { useAuth } from "@/hooks/useAuth";
import { BuyOrderStatus, PanType } from "@/lib/buy-order-types";
import { setPanTypeInNotes } from "@/lib/pan-notes";

interface NewPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProductItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  warehouse_id: string;
  // Optional user-entered total amount (used to back-calculate quantity when needed)
  total_amount?: number;
}

export function NewPurchaseOrderDialog({ open, onOpenChange }: NewPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [isOffMarket, setIsOffMarket] = useState(false);
  const [isGeneratingOrderNumber, setIsGeneratingOrderNumber] = useState(false);
  const [selectedWalletFee, setSelectedWalletFee] = useState<number>(0);
  
  const [formData, setFormData] = useState({
    order_number: "",
    supplier_name: "",
    contact_number: "",
    description: "",
    payment_method_type: "",
    upi_id: "",
    bank_account_number: "",
    bank_account_name: "",
    ifsc_code: "",
    assigned_to: "",
    order_date: new Date().toISOString().split('T')[0],
    tds_option: "NO_TDS", // "NO_TDS" | "TDS_1_PERCENT" | "TDS_20_PERCENT"
    pan_number: "",
    order_expiry_minutes: 55, // Default 55 minutes
    is_safe_fund: false,
  });

  const [productItems, setProductItems] = useState<ProductItem[]>([]);

  // Fetch live USDT/INR rate
  const { data: usdtRateData } = useUSDTRate();
  
  // Fetch average cost for USDT
  const { data: averageCosts } = useAverageCost();

  // Normalize items so amount calculations always work even if user filled "Total Amount" first
  const normalizedItems = useMemo(() => {
    return (productItems || []).map((item) => {
      const totalFromField = Number((item as any).total_amount || 0);
      const unitPrice = Number(item.unit_price || 0);

      let quantity = Number(item.quantity || 0);
      if ((quantity <= 0 || !Number.isFinite(quantity)) && totalFromField > 0 && unitPrice > 0) {
        quantity = totalFromField / unitPrice;
      }

      const total = totalFromField > 0 ? totalFromField : quantity * unitPrice;

      return {
        ...item,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        total_amount: Number.isFinite(total) ? total : 0,
      };
    });
  }, [productItems]);

  // Calculate amounts based on TDS option
  const totalAmount = useMemo(
    () => normalizedItems.reduce((total, item) => total + (item.total_amount || 0), 0),
    [normalizedItems]
  );
  const totalQuantity = useMemo(
    () => normalizedItems.reduce((total, item) => total + (item.quantity || 0), 0),
    [normalizedItems]
  );
  const tdsRate = formData.tds_option === "TDS_1_PERCENT" ? 0.01 : formData.tds_option === "TDS_20_PERCENT" ? 0.20 : 0;
  const tdsAmount = totalAmount * tdsRate;
  
  // Calculate platform fee in USDT based on total amount
  const calculatedFee = useMemo(() => {
    if (isOffMarket || !totalAmount || totalAmount <= 0 || !selectedWalletFee) {
      return { feeINR: 0, feeUSDT: 0, feePercentage: 0 };
    }

    const usdtRate = usdtRateData?.rate || 84.5;
    const { feeINR, feeUSDT } = calculatePlatformFeeInUSDT(
      totalAmount,
      selectedWalletFee,
      usdtRate
    );

    return {
      feeINR,
      feeUSDT,
      feePercentage: selectedWalletFee
    };
  }, [totalAmount, selectedWalletFee, usdtRateData, isOffMarket]);

  // Get average buying price for USDT
  const averageBuyingPrice = useMemo(() => {
    const usdtCost = averageCosts?.find(c => c.product_code === 'USDT');
    return usdtCost?.average_cost || 0;
  }, [averageCosts]);
  
  const netPayableAmount = totalAmount - tdsAmount;
  const tdsApplied = formData.tds_option !== "NO_TDS";

  // Fetch clients for supplier dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch wallets to get fee percentages
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, fee_percentage, is_fee_enabled')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Update wallet fee when product items change (get fee from first item's wallet)
  useEffect(() => {
    if (productItems.length > 0 && productItems[0].warehouse_id && wallets) {
      const selectedWallet = wallets.find(w => w.id === productItems[0].warehouse_id);
      if (selectedWallet && selectedWallet.is_fee_enabled) {
        setSelectedWalletFee(selectedWallet.fee_percentage || 0);
      } else {
        setSelectedWalletFee(0);
      }
    } else {
      setSelectedWalletFee(0);
    }
  }, [productItems, wallets]);

  // Fetch employees for assignment
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_id')
        .eq('status', 'ACTIVE')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const createPurchaseOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // NOTE: For regular purchase orders, we do NOT create seller clients at order creation.
      // Seller clients are only created when the order is COMPLETED (handled in BuyOrderCard completion logic).
      // This prevents pending sellers from appearing for approval before the order is finalized.
      // Manual Purchase Entry handles its own seller creation since those orders are immediately completed.
      
      // Calculate order expiry timestamp
      const orderExpiryMinutes = orderData.order_expiry_minutes || 55;
      const orderExpiresAt = new Date(Date.now() + orderExpiryMinutes * 60 * 1000).toISOString();
      
      // Determine initial order_status based on data provided at creation
      // This prevents prompting for PAN/Banking again if already provided
      const hasBankingDetails = orderData.payment_method_type === 'UPI' 
        ? !!orderData.upi_id 
        : !!(orderData.bank_account_name && orderData.bank_account_number && orderData.ifsc_code);
      
      // Determine if TDS/PAN type is selected
      const hasTdsSelected = orderData.tds_option !== '' && orderData.tds_option !== undefined;
      
      // Map TDS option to PanType for notes field
      let panTypeMarker: PanType | null = null;
      if (orderData.tds_option === 'TDS_1_PERCENT') {
        panTypeMarker = 'pan_provided';
      } else if (orderData.tds_option === 'TDS_20_PERCENT') {
        panTypeMarker = 'pan_not_provided';
      } else if (orderData.tds_option === 'NO_TDS') {
        panTypeMarker = 'non_tds';
      }
      
      // Build notes field with pan_type marker
      let notesWithPanType = orderData.description || null;
      if (panTypeMarker) {
        notesWithPanType = setPanTypeInNotes(notesWithPanType, panTypeMarker);
      }
      
      // Calculate initial order_status based on what's already provided
      let initialOrderStatus: BuyOrderStatus = 'new';
      if (hasBankingDetails && hasTdsSelected) {
        // Both banking and TDS/PAN provided - ready for Add to Bank
        initialOrderStatus = 'pan_collected';
      } else if (hasBankingDetails) {
        // Only banking provided
        initialOrderStatus = 'banking_collected';
      } else if (hasTdsSelected) {
        // Only TDS selected (unusual but supported) - still need banking
        initialOrderStatus = 'new';
      }
      
      // Create purchase order with correct initial state
      const { data: purchaseOrder, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: orderData.order_number,
          supplier_name: orderData.supplier_name,
          contact_number: orderData.contact_number,
          description: orderData.description,
          notes: notesWithPanType, // Store TDS type marker in notes
          payment_method_type: orderData.payment_method_type,
          upi_id: orderData.upi_id,
          bank_account_number: orderData.bank_account_number,
          bank_account_name: orderData.bank_account_name,
          ifsc_code: orderData.ifsc_code,
          assigned_to: orderData.assigned_to,
          total_amount: totalAmount,
          // Persist convenience fields used across the buy-order workflow UI
          quantity: totalQuantity,
          price_per_unit: totalQuantity > 0 ? totalAmount / totalQuantity : 0,
          tds_applied: tdsApplied,
          pan_number: orderData.pan_number,
          tds_amount: tdsAmount,
          net_payable_amount: netPayableAmount,
          tax_amount: tdsAmount,
          order_date: orderData.order_date,
          order_expires_at: orderExpiresAt,
          order_status: initialOrderStatus, // Set correct initial status!
          created_by: user?.id,
          status: 'PENDING',
          is_off_market: isOffMarket
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Verify purchase order was created and is readable (RLS check)
      const { data: verifiedOrder, error: verifyError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('id', purchaseOrder.id)
        .single();

      if (verifyError || !verifiedOrder) {
        console.error('Purchase order verification failed:', verifyError);
        throw new Error('Purchase order created but not readable - check RLS policies');
      }

       // Create purchase order items
       if (normalizedItems.length > 0) {
         const orderItems = normalizedItems.map(item => ({
          purchase_order_id: purchaseOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
           total_price: item.total_amount || (item.quantity * item.unit_price),
          warehouse_id: item.warehouse_id
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(orderItems);

        if (itemsError) throw itemsError;
      }

      // Create TDS record if TDS is applied
      if (tdsApplied) {
        const currentYear = new Date().getFullYear();
        const financialYear = `${currentYear}-${currentYear + 1}`;
        
        const { error: tdsError } = await supabase
          .from('tds_records')
          .insert({
            purchase_order_id: purchaseOrder.id,
            pan_number: orderData.pan_number || null,
            total_amount: totalAmount,
            tds_rate: tdsRate * 100, // Store as percentage
            tds_amount: tdsAmount,
            net_payable_amount: netPayableAmount,
            financial_year: financialYear
          });

        if (tdsError) throw tdsError;
      }

      // Record bank EXPENSE transaction to deduct from bank balance (if bank is identifiable)
      try {
        let bankAccountId: string | null = null;

        if (orderData.payment_method_type === 'BANK_TRANSFER') {
          // Prefer matching by account number, then fallback to account name
          if (orderData.bank_account_number) {
            const { data: bankByNumber } = await supabase
              .from('bank_accounts')
              .select('id')
              .eq('account_number', orderData.bank_account_number)
              .maybeSingle();
            bankAccountId = bankByNumber?.id || bankAccountId;
          }
          if (!bankAccountId && orderData.bank_account_name) {
            const { data: bankByName } = await supabase
              .from('bank_accounts')
              .select('id')
              .eq('account_name', orderData.bank_account_name)
              .maybeSingle();
            bankAccountId = bankByName?.id || bankAccountId;
          }
        } else if (orderData.payment_method_type === 'UPI' && orderData.upi_id) {
          // Best-effort resolution via configured purchase payment methods
          const { data: ppm } = await supabase
            .from('purchase_payment_methods')
            .select('bank_account_name')
            .eq('upi_id', orderData.upi_id)
            .maybeSingle();
          if (ppm?.bank_account_name) {
            const { data: bankFromPpm } = await supabase
              .from('bank_accounts')
              .select('id')
              .eq('account_name', ppm.bank_account_name)
              .maybeSingle();
            bankAccountId = bankFromPpm?.id || bankAccountId;
          }
        }

        if (bankAccountId) {
          await supabase
            .from('bank_transactions')
            .insert({
              bank_account_id: bankAccountId,
              transaction_type: 'EXPENSE',
              amount: netPayableAmount,
              transaction_date: orderData.order_date,
              category: 'Purchase',
              description: `Stock Purchase - ${orderData.supplier_name} - Order #${orderData.order_number}`,
              reference_number: orderData.order_number,
              related_account_name: orderData.supplier_name,
              created_by: user?.id || getCurrentUserId() || null, // Persist user ID for audit trail
            });
        }
      } catch (txErr) {
        console.warn('Bank transaction creation skipped:', txErr);
      }

      // Handle USDT fee deduction from wallet
       if (!isOffMarket && calculatedFee.feeUSDT > 0 && normalizedItems.length > 0) {
         const walletId = normalizedItems[0].warehouse_id;
        
        if (walletId) {
          // Debit fee from wallet
          await supabase
            .from('wallet_transactions')
            .insert({
              wallet_id: walletId,
              transaction_type: 'DEBIT',
              amount: calculatedFee.feeUSDT,
              reference_type: 'PLATFORM_FEE',
              reference_id: purchaseOrder.id,
              description: `Platform fee for purchase order ${orderData.order_number} (${calculatedFee.feePercentage}% of ₹${totalAmount})`,
              balance_before: 0,
              balance_after: 0
            });

          // Record fee deduction with all relevant data
          await supabase
            .from('wallet_fee_deductions')
            .insert({
              wallet_id: walletId,
              order_id: purchaseOrder.id,
              order_type: 'PURCHASE',
              order_number: orderData.order_number,
              gross_amount: totalAmount,
              fee_percentage: calculatedFee.feePercentage,
              fee_amount: calculatedFee.feeINR,
              net_amount: totalAmount,
              fee_usdt_amount: calculatedFee.feeUSDT,
              usdt_rate_used: usdtRateData?.rate || 0,
              average_buying_price: averageBuyingPrice,
              fee_inr_value_at_buying_price: calculatedFee.feeUSDT * averageBuyingPrice
            });
        }
      }

      // Record order creation timing
      await recordActionTiming(purchaseOrder.id, 'order_created', 'purchase_creator', user?.id);

      // Log action for audit trail
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_ORDER_CREATED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: purchaseOrder.id,
        module: Modules.PURCHASE,
        metadata: { order_number: purchaseOrder.order_number, supplier_name: orderData.supplier_name }
      });

      return purchaseOrder;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Order Created",
        description: "Purchase order has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['pending-seller-approvals'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Purchase order creation error:', error);
      toast({
        title: "Error",
        description: `Failed to create purchase order: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      order_number: "",
      supplier_name: "",
      contact_number: "",
      description: "",
      payment_method_type: "",
      upi_id: "",
      bank_account_number: "",
      bank_account_name: "",
      ifsc_code: "",
      assigned_to: "",
      order_date: new Date().toISOString().split('T')[0],
      tds_option: "NO_TDS",
      pan_number: "",
      order_expiry_minutes: 55,
      is_safe_fund: false,
    });
    setProductItems([]);
    setSelectedClientId('');
    setIsNewClient(false);
    setIsOffMarket(false);
  };

  // Handle supplier selection from autocomplete
  const handleSupplierSelect = (clientId: string, clientName: string) => {
    setSelectedClientId(clientId);
    setFormData(prev => ({ ...prev, supplier_name: clientName }));
  };

  // Auto-fill contact number when supplier is selected from clients
  const handleSupplierChange = (supplierName: string) => {
    setFormData(prev => ({ ...prev, supplier_name: supplierName }));
  };

  const handleContactChange = (contact: string) => {
    setFormData(prev => ({ ...prev, contact_number: contact }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (createPurchaseOrderMutation.isPending) {
      return;
    }
    
    // Validation
    // For off-market orders, order number will be generated at creation time
    if (!isOffMarket && !formData.order_number.trim()) {
      toast({
        title: "Error",
        description: "Order number is mandatory.",
        variant: "destructive",
      });
      return;
    }

    if (productItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add a product item.",
        variant: "destructive",
      });
      return;
    }

    // Validate item amounts (quantity/unit price OR total amount)
    const invalidItem = normalizedItems.find((item) => {
      if (!item.product_id) return true;
      if (!item.warehouse_id) return true;
      if (item.unit_price <= 0) return true;
      if (item.quantity <= 0) return true;
      if ((item.total_amount || 0) <= 0) return true;
      return false;
    });
    if (invalidItem || totalAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter valid quantity and unit price (or total amount) for all items.",
        variant: "destructive",
      });
      return;
    }

    // Wallet validation is included above in invalidItem check

    if (formData.tds_option === "TDS_1_PERCENT" && !formData.pan_number.trim()) {
      toast({
        title: "Error",
        description: "PAN number is mandatory when 1% TDS is applied.",
        variant: "destructive",
      });
      return;
    }

    // For off-market orders, generate the actual order number at submission (consuming the sequence)
    const submitOrder = async () => {
      let orderNumber = formData.order_number;
      
      if (isOffMarket) {
        try {
          const { data: offMarketNumber, error } = await supabase.rpc('generate_off_market_purchase_order_number');
          if (error || !offMarketNumber) {
            toast({
              title: "Error",
              description: "Failed to generate off-market order number",
              variant: "destructive"
            });
            return;
          }
          orderNumber = offMarketNumber;
        } catch (err) {
          console.error('Failed to generate off-market order number:', err);
          toast({
            title: "Error",
            description: "Failed to generate off-market order number",
            variant: "destructive"
          });
          return;
        }
      }
      
      createPurchaseOrderMutation.mutate({
        ...formData,
        order_number: orderNumber
      });
    };
    
    submitOrder();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Purchase Order</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="order_number">Purchase Order Number *</Label>
              <Input
                id="order_number"
                value={formData.order_number}
                onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                required
                disabled={isOffMarket || isGeneratingOrderNumber}
                className={isOffMarket ? "bg-muted" : ""}
                placeholder={isGeneratingOrderNumber ? "Generating..." : isOffMarket ? "Auto-generated" : "Enter order number"}
              />
            </div>

            <div>
              <Label htmlFor="order_date">Order Date *</Label>
              <Input
                id="order_date"
                type="date"
                value={formData.order_date}
                onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                required
              />
            </div>

            <div>
              <SupplierAutocomplete
                value={formData.supplier_name}
                onChange={handleSupplierChange}
                onContactChange={handleContactChange}
                onClientSelect={handleSupplierSelect}
                onNewClient={(isNew) => setIsNewClient(isNew)}
                selectedClientId={selectedClientId}
              />
            </div>

            <div>
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                value={formData.contact_number}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="assigned_to">Assigned To</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_to: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.name}>
                      {employee.name} ({employee.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Total Amount</Label>
              <Input
                value={`₹${totalAmount.toFixed(2)}`}
                readOnly
                className="bg-gray-50 font-semibold"
              />
            </div>
          </div>

          {/* Order Expiry Section */}
          <div className="space-y-2">
            <Label>Order Expiry (minutes)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={formData.order_expiry_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, order_expiry_minutes: parseInt(e.target.value) || 0 }))}
                className="w-24"
                placeholder="55"
              />
              <div className="flex gap-1">
                {[30, 45, 55, 60].map((mins) => (
                  <Button
                    key={mins}
                    type="button"
                    variant={formData.order_expiry_minutes === mins ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, order_expiry_minutes: mins }))}
                  >
                    {mins}m
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Default: 55 minutes</p>
          </div>

          {/* TDS Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <Label className="text-lg font-semibold">TDS Options</Label>
            
            <Select 
              value={formData.tds_option} 
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                tds_option: value,
                pan_number: value !== "TDS_1_PERCENT" ? "" : prev.pan_number 
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select TDS option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NO_TDS">No TDS Deduction</SelectItem>
                <SelectItem value="TDS_1_PERCENT">TDS @ 1% (PAN Required)</SelectItem>
                <SelectItem value="TDS_20_PERCENT">TDS @ 20% (No PAN)</SelectItem>
              </SelectContent>
            </Select>

            {formData.tds_option === "TDS_1_PERCENT" && (
              <div>
                <Label htmlFor="pan_number">PAN Number *</Label>
                <Input
                  id="pan_number"
                  value={formData.pan_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, pan_number: e.target.value.toUpperCase() }))}
                  placeholder="Enter PAN number"
                  required
                />
              </div>
            )}

            {formData.tds_option !== "NO_TDS" && (
              <div className="space-y-2 bg-muted/50 p-3 rounded-md">
                <div className="flex justify-between text-sm">
                  <span>Total Amount:</span>
                  <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>TDS Rate:</span>
                  <span className="font-medium">{formData.tds_option === "TDS_1_PERCENT" ? "1%" : "20%"}</span>
                </div>
                <div className="flex justify-between text-sm text-orange-600">
                  <span>TDS Amount:</span>
                  <span className="font-medium">₹{tdsAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Net Payable Amount:</span>
                  <span className="text-primary">₹{netPayableAmount.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Off Market & Platform Fee Section */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Off Market Order</Label>
                <p className="text-sm text-muted-foreground">
                  Enable to bypass platform fee deduction
                </p>
              </div>
              <div className="flex items-center gap-3">
                {usdtRateData && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    USDT/INR: ₹{usdtRateData.rate.toFixed(2)}
                  </Badge>
                )}
                <Switch 
                  checked={isOffMarket} 
                  onCheckedChange={async (checked) => {
                    setIsOffMarket(checked);
                    if (checked) {
                      // Preview off-market order number (without consuming sequence)
                      setIsGeneratingOrderNumber(true);
                      try {
                        const { data, error } = await supabase.rpc('preview_off_market_purchase_order_number');
                        if (!error && data) {
                          setFormData(prev => ({ ...prev, order_number: data }));
                        }
                      } catch (err) {
                        console.error('Failed to preview off-market order number:', err);
                      } finally {
                        setIsGeneratingOrderNumber(false);
                      }
                    } else {
                      // Clear order number when turning off
                      setFormData(prev => ({ ...prev, order_number: '' }));
                    }
                  }}
                />
              </div>
            </div>
            
            {!isOffMarket && calculatedFee.feePercentage > 0 && (
              <div className="space-y-2 bg-background p-3 rounded-md border">
                <div className="flex justify-between text-sm">
                  <span>Total Order Amount:</span>
                  <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Platform Fee Rate:</span>
                  <span className="font-medium">{calculatedFee.feePercentage}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Fee (INR):</span>
                  <span className="font-medium">₹{calculatedFee.feeINR.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-amber-600 font-medium border-t pt-2">
                  <span>Fee to Deduct (USDT):</span>
                  <span>{calculatedFee.feeUSDT.toFixed(6)} USDT</span>
                </div>
                {usdtRateData && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>USDT/INR Rate Used:</span>
                    <span>₹{usdtRateData.rate.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            
            {isOffMarket && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                No platform fees will be applied
              </Badge>
            )}
          </div>

          {/* Safe Fund Checkbox */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="safe_fund"
              checked={formData.is_safe_fund}
              onChange={(e) => setFormData(prev => ({ ...prev, is_safe_fund: e.target.checked }))}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <Label htmlFor="safe_fund" className="text-sm font-medium cursor-pointer">
              Safe Fund
            </Label>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter order description..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <ProductSelectionSection 
            items={productItems}
            onItemsChange={setProductItems}
          />

          {/* Payment Method Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <Label className="text-lg font-semibold">Payment Method Details</Label>
            
            <div>
              <Label htmlFor="payment_method_type">Payment Method Type *</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.payment_method_type === "UPI" && (
              <div>
                <Label htmlFor="upi_id">UPI ID *</Label>
                <Input
                  id="upi_id"
                  value={formData.upi_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, upi_id: e.target.value }))}
                  placeholder="Enter UPI ID"
                  required
                />
              </div>
            )}

            {formData.payment_method_type === "BANK_TRANSFER" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bank_account_number">Bank Account Number *</Label>
                  <Input
                    id="bank_account_number"
                    value={formData.bank_account_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_account_number: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="bank_account_name">Account Holder Name *</Label>
                  <Input
                    id="bank_account_name"
                    value={formData.bank_account_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_account_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="ifsc_code">IFSC Code *</Label>
                  <Input
                    id="ifsc_code"
                    value={formData.ifsc_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, ifsc_code: e.target.value }))}
                    required
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={createPurchaseOrderMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createPurchaseOrderMutation.isPending}
              className="min-w-[180px]"
            >
              {createPurchaseOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Purchase Order"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
