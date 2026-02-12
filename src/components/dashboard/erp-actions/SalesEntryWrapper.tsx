import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { CustomerAutocomplete } from "@/components/sales/CustomerAutocomplete";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { AlertTriangle } from "lucide-react";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface SalesEntryWrapperProps {
  item: ErpActionQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (refId?: string) => void;
}

export function SalesEntryWrapper({ item, open, onOpenChange, onSuccess }: SalesEntryWrapperProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedWalletBalance, setSelectedWalletBalance] = useState<number | null>(null);
  const [selectedWalletFee, setSelectedWalletFee] = useState<number>(0);
  const [calculatedFee, setCalculatedFee] = useState<number>(0);
  const [stockValidationError, setStockValidationError] = useState<string | null>(null);
  const [isOffMarket, setIsOffMarket] = useState(true); // Default off-market for ERP actions
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [isNewClient, setIsNewClient] = useState(false);

  const [formData, setFormData] = useState({
    order_number: '',
    client_name: '',
    client_phone: '',
    client_state: '',
    product_id: '',
    wallet_id: item.wallet_id || '',
    platform: '',
    quantity: String(item.amount),
    price_per_unit: '',
    total_amount: '',
    platform_fees: '',
    sales_payment_method_id: '',
    payment_status: 'COMPLETED',
    order_datetime: new Date().toISOString().slice(0, 16),
    description: `ERP Action: Withdrawal reconciliation (${item.tx_id || item.movement_id})`,
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Auto-match product by asset
  useEffect(() => {
    if (products && !formData.product_id) {
      const match = products.find(
        (p) => p.code?.toUpperCase() === item.asset.toUpperCase() || p.name?.toUpperCase() === item.asset.toUpperCase()
      );
      if (match) setFormData((prev) => ({ ...prev, product_id: match.id }));
    }
  }, [products, item.asset]);

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*, fee_percentage, is_fee_enabled')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch specific wallet balance
  const { data: walletBalance } = useQuery({
    queryKey: ['wallet_balance', formData.wallet_id],
    queryFn: async () => {
      if (!formData.wallet_id) return null;
      const { data, error } = await supabase
        .from('wallets')
        .select('current_balance, wallet_name, fee_percentage, is_fee_enabled')
        .eq('id', formData.wallet_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!formData.wallet_id,
  });

  useEffect(() => {
    setSelectedWalletBalance(walletBalance?.current_balance || null);
    if (walletBalance?.is_fee_enabled) {
      setSelectedWalletFee(walletBalance?.fee_percentage || 0);
    } else {
      setSelectedWalletFee(0);
    }
  }, [walletBalance]);

  // Auto-calculate platform fee
  useEffect(() => {
    if (!isOffMarket && selectedWalletFee > 0) {
      const quantity = parseFloat(formData.quantity) || 0;
      const feeAmount = quantity * (selectedWalletFee / 100);
      setCalculatedFee(feeAmount);
      setFormData(prev => ({ ...prev, platform_fees: feeAmount.toFixed(6) }));
    } else {
      setCalculatedFee(0);
      setFormData(prev => ({ ...prev, platform_fees: '0' }));
    }
  }, [formData.quantity, selectedWalletFee, isOffMarket]);

  // Validate stock
  useEffect(() => {
    if (formData.quantity && selectedWalletBalance !== null) {
      const quantity = parseFloat(formData.quantity);
      const platformFees = parseFloat(formData.platform_fees) || 0;
      const totalQuantityNeeded = quantity + platformFees;
      if (totalQuantityNeeded > selectedWalletBalance) {
        setStockValidationError(`Total required (${totalQuantityNeeded.toFixed(2)}) exceeds available balance!`);
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
        .select(`*, bank_accounts:bank_account_id(account_name, bank_name)`)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      if (field === 'wallet_id' && value && wallets) {
        const selectedWallet = wallets.find(w => w.id === value);
        if (selectedWallet) {
          const platformName = selectedWallet.wallet_name.split(' ')[0];
          updated.platform = platformName;
        }
      }

      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(updated.quantity) || 0;
        const price = field === 'price_per_unit' ? parseFloat(value) || 0 : parseFloat(updated.price_per_unit) || 0;
        const total = field === 'total_amount' ? parseFloat(value) || 0 : parseFloat(String(updated.total_amount)) || 0;

        if (field === 'quantity' && price > 0) {
          updated.total_amount = (qty * price).toFixed(2);
        } else if (field === 'price_per_unit') {
          if (total > 0 && price > 0) {
            updated.quantity = (total / price).toFixed(4);
          } else if (qty > 0 && price > 0) {
            updated.total_amount = (qty * price).toFixed(2);
          }
        } else if (field === 'total_amount') {
          if (price > 0) {
            updated.quantity = (total / price).toFixed(4);
          }
        }
      }

      return updated;
    });
  };

  const quantity = parseFloat(formData.quantity) || 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!formData.client_name.trim()) throw new Error("Customer name is required");
      if (!formData.wallet_id) throw new Error("Wallet is required");
      if (!formData.price_per_unit || parseFloat(formData.price_per_unit) <= 0) throw new Error("Price is required");
      if (stockValidationError) throw new Error(stockValidationError);

      const { data: orderNumber } = await supabase.rpc("generate_off_market_sales_order_number");
      const createdBy = getCurrentUserId();

      const { data: result, error } = await supabase
        .from("sales_orders")
        .insert([{
          order_number: orderNumber || `ERP-S-${Date.now()}`,
          client_name: formData.client_name,
          client_phone: formData.client_phone || null,
          client_state: formData.client_state || null,
          product_id: formData.product_id || null,
          wallet_id: formData.wallet_id || null,
          platform: formData.platform || null,
          quantity: parseFloat(formData.quantity),
          price_per_unit: parseFloat(formData.price_per_unit),
          total_amount: parseFloat(formData.total_amount) || 0,
          sales_payment_method_id: formData.sales_payment_method_id || null,
          payment_status: "COMPLETED",
          order_date: formData.order_datetime ? `${formData.order_datetime}:00.000Z` : new Date().toISOString(),
          description: formData.description,
          is_off_market: isOffMarket,
          created_by: createdBy,
        }])
        .select()
        .single();

      if (error) throw error;

      // Handle settlement status based on payment method
      if (formData.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id, payment_gateway, current_usage, payment_limit')
          .eq('id', formData.sales_payment_method_id)
          .single();

        const settlementStatus = paymentMethod?.payment_gateway ? 'PENDING' : 'DIRECT';
        await supabase.from('sales_orders').update({ settlement_status: settlementStatus }).eq('id', result.id);

        if (paymentMethod?.payment_gateway) {
          const newUsage = (paymentMethod.current_usage || 0) + (parseFloat(formData.total_amount) || 0);
          await supabase.from('sales_payment_methods').update({ current_usage: newUsage }).eq('id', formData.sales_payment_method_id);
        }
      }

      // Process wallet deduction
      if (formData.wallet_id) {
        const qty = parseFloat(formData.quantity);
        const { error: walletDeductError } = await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: result.id,
          wallet_id: formData.wallet_id,
          usdt_amount: qty,
        });
        if (walletDeductError) throw new Error(`Wallet deduction failed: ${walletDeductError.message}`);

        // Process platform fee deduction
        const platformFees = parseFloat(formData.platform_fees) || 0;
        if (platformFees > 0) {
          const { error: feeError } = await supabase.rpc('process_platform_fee_deduction', {
            p_order_id: result.id,
            p_order_type: 'SALES_ORDER',
            p_wallet_id: formData.wallet_id,
            p_fee_amount: platformFees,
            p_order_number: orderNumber,
          });
          if (feeError) console.warn('Platform fee deduction failed:', feeError);

          await supabase.from('sales_orders').update({
            fee_amount: platformFees,
            fee_percentage: selectedWalletFee,
          }).eq('id', result.id);
        }
      }

      // Handle client onboarding
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id, name')
        .or(`name.ilike.%${formData.client_name}%,phone.eq.${formData.client_phone || 'NO_PHONE_MATCH'}`)
        .limit(1)
        .maybeSingle();

      if (!existingClient) {
        await supabase.from('client_onboarding_approvals').insert({
          sales_order_id: result.id,
          client_name: formData.client_name,
          client_phone: formData.client_phone || null,
          client_state: formData.client_state || null,
          order_amount: parseFloat(formData.total_amount) || 0,
          order_date: formData.order_datetime ? formData.order_datetime.split('T')[0] : new Date().toISOString().split('T')[0],
          approval_status: 'PENDING',
        });
      } else {
        const { updateClientFromOrder } = await import('@/utils/updateClientFromOrder');
        await updateClientFromOrder({
          clientId: existingClient.id,
          phone: formData.client_phone,
          state: formData.client_state,
        });
      }

      return { orderNumber, id: result?.id };
    },
    onSuccess: (data) => {
      toast({ title: "Sales Entry Created", description: `Order ${data.orderNumber} created.` });
      queryClient.invalidateQueries({ queryKey: ["sales_orders"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["client_onboarding_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onSuccess(data.orderNumber || undefined);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sales Entry — {item.amount} {item.asset}</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }} className="space-y-4" noValidate>
          {/* Row 1: Order Number + Customer Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Order Number *</Label>
              <Input value="Auto-generated" disabled className="bg-muted" />
            </div>
            <div>
              <Label>Customer Phone</Label>
              <Input
                value={formData.client_phone}
                onChange={(e) => handleInputChange('client_phone', e.target.value)}
                placeholder="Enter phone"
              />
            </div>
          </div>

          {/* Row 2: Customer Name + State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <CustomerAutocomplete
                value={formData.client_name}
                onChange={(value) => handleInputChange('client_name', value)}
                onPhoneChange={(phone) => handleInputChange('client_phone', phone)}
                onStateChange={(state) => handleInputChange('client_state', state)}
                onClientSelect={(client) => {
                  if (client) {
                    setSelectedClientId(client.id);
                  } else {
                    setSelectedClientId(undefined);
                    setFormData(prev => ({ ...prev, client_phone: '', client_state: '' }));
                  }
                }}
                onNewClient={(isNew) => setIsNewClient(isNew)}
                selectedClientId={selectedClientId}
              />
            </div>
            <div>
              <Label>State</Label>
              <Select value={formData.client_state} onValueChange={(value) => handleInputChange('client_state', value)}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-[100] max-h-60">
                  {INDIAN_STATES_AND_UTS.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Product + Wallet */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Product</Label>
              <Select value={formData.product_id} onValueChange={(value) => handleInputChange('product_id', value)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-[100]">
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>{product.name} - {product.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wallet *</Label>
              <Select value={formData.wallet_id} onValueChange={(value) => handleInputChange('wallet_id', value)}>
                <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-[100]">
                  {wallets?.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} - Balance: {wallet.current_balance}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pricing row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Total Amount (₹)</Label>
              <Input
                type="number"
                value={formData.total_amount}
                onChange={(e) => handleInputChange('total_amount', parseFloat(e.target.value) || 0)}
                min="0" step="0.01" placeholder="Enter total amount"
              />
            </div>
            <div>
              <Label>Price Per Unit (₹) *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                min="0" step="0.01" placeholder="Enter price per unit"
              />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                min="0" step="0.01" placeholder="Enter quantity"
                className={stockValidationError ? "border-destructive" : ""}
              />
            </div>
          </div>

          {/* Wallet balance warning */}
          {stockValidationError && (
            <Alert className="border-destructive bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">{stockValidationError}</AlertDescription>
            </Alert>
          )}

          {selectedWalletBalance !== null && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Available Balance: <strong>{selectedWalletBalance.toLocaleString()}</strong>
                {selectedWalletFee > 0 && !isOffMarket && (
                  <span className="ml-2 text-muted-foreground">(Platform Fee: {selectedWalletFee}%)</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Off Market Toggle */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Off Market Order</Label>
                <p className="text-sm text-muted-foreground">Enable to bypass platform fee deduction</p>
              </div>
              <Switch checked={isOffMarket} onCheckedChange={setIsOffMarket} />
            </div>

            {!isOffMarket && selectedWalletFee > 0 && quantity > 0 && (
              <div className="space-y-2 bg-background p-3 rounded-md border">
                <div className="flex justify-between text-sm">
                  <span>Quantity Sold:</span>
                  <span className="font-medium">{quantity.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm text-orange-600">
                  <span>Platform Fee ({selectedWalletFee}%):</span>
                  <span className="font-medium">+{calculatedFee.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Total Deducted from Wallet:</span>
                  <span className="text-primary">{(quantity + calculatedFee).toFixed(4)}</span>
                </div>
              </div>
            )}

            {isOffMarket && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                No platform fees will be applied
              </Badge>
            )}
          </div>

          {/* Payment Method + Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Payment Method</Label>
              <Select value={formData.sales_payment_method_id} onValueChange={(value) => handleInputChange('sales_payment_method_id', value)}>
                <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  {paymentMethods?.map((method: any) => {
                    const displayLabel = method.nickname
                      ? method.nickname
                      : method.type === 'UPI' && method.upi_id
                        ? `${method.upi_id} (${method.risk_category})`
                        : method.bank_accounts
                          ? `${method.bank_accounts.account_name} (${method.risk_category})`
                          : `${method.type} (${method.risk_category})`;
                    return (
                      <SelectItem key={method.id} value={method.id}>
                        {displayLabel} - ₹{method.current_usage?.toLocaleString()}/{method.payment_limit?.toLocaleString()}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Date & Time</Label>
              <Input
                type="datetime-local"
                value={formData.order_datetime}
                onChange={(e) => handleInputChange('order_datetime', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? "Creating..." : "Create Sales Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
