import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { CustomerAutocomplete } from "@/components/sales/CustomerAutocomplete";
import { getCurrentUserId } from "@/lib/system-action-logger";

interface SalesEntryWrapperProps {
  item: ErpActionQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (refId?: string) => void;
}

export function SalesEntryWrapper({ item, open, onOpenChange, onSuccess }: SalesEntryWrapperProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    client_name: "",
    client_phone: "",
    product_id: "",
    wallet_id: item.wallet_id || "",
    quantity: String(item.amount),
    price_per_unit: "",
    total_amount: "",
    sales_payment_method_id: "",
    order_datetime: new Date().toISOString().slice(0, 16),
    description: `ERP Action: Withdrawal reconciliation (${item.tx_id || item.movement_id})`,
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
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
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wallets").select("*").eq("is_active", true).order("wallet_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ["sales_payment_methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_payment_methods")
        .select("*, bank_accounts:bank_account_id(account_name, bank_name)")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      const qty = parseFloat(field === "quantity" ? value : prev.quantity) || 0;
      const price = parseFloat(field === "price_per_unit" ? value : prev.price_per_unit) || 0;
      if (field === "quantity" && price > 0) updated.total_amount = (qty * price).toFixed(2);
      if (field === "price_per_unit" && qty > 0) updated.total_amount = (qty * price).toFixed(2);
      if (field === "total_amount" && price > 0) updated.quantity = (parseFloat(value) / price).toFixed(4);
      return updated;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!formData.client_name) throw new Error("Client name is required");
      if (!formData.wallet_id) throw new Error("Wallet is required");
      if (!formData.price_per_unit) throw new Error("Price is required");

      const { data: orderNumber } = await supabase.rpc("generate_off_market_sales_order_number");
      const createdBy = getCurrentUserId();

      const { data: result, error } = await supabase
        .from("sales_orders")
        .insert([{
          order_number: orderNumber || `ERP-S-${Date.now()}`,
          client_name: formData.client_name,
          client_phone: formData.client_phone || null,
          product_id: formData.product_id || null,
          wallet_id: formData.wallet_id || null,
          quantity: parseFloat(formData.quantity),
          price_per_unit: parseFloat(formData.price_per_unit),
          total_amount: parseFloat(formData.total_amount) || 0,
          sales_payment_method_id: formData.sales_payment_method_id || null,
          payment_status: "COMPLETED",
          order_date: formData.order_datetime ? `${formData.order_datetime}:00.000Z` : new Date().toISOString(),
          description: formData.description,
          is_off_market: true,
          created_by: createdBy,
        }])
        .select()
        .single();

      if (error) throw error;

      // Process wallet deduction
      if (formData.wallet_id && result) {
        const { error: deductErr } = await supabase.rpc("process_sales_order_wallet_deduction", {
          sales_order_id: result.id,
          wallet_id: formData.wallet_id,
          usdt_amount: parseFloat(formData.quantity),
        });
        if (deductErr) console.error("Wallet deduction error:", deductErr);
      }

      return { orderNumber, id: result?.id };
    },
    onSuccess: (data) => {
      toast({ title: "Sales Entry Created", description: `Order ${data.orderNumber} created.` });
      queryClient.invalidateQueries({ queryKey: ["sales_orders"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      onSuccess(data.orderNumber || undefined);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sales Entry — {item.amount} {item.asset}</DialogTitle>
          <DialogDescription>Record this withdrawal as an asset sale</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }} className="space-y-4">
          <div>
            <Label>Client / Customer</Label>
            <CustomerAutocomplete
              value={formData.client_name}
              onChange={(name) => setFormData((p) => ({ ...p, client_name: name }))}
              onClientSelect={() => {}}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Product</Label>
              <Select value={formData.product_id} onValueChange={(v) => setFormData((p) => ({ ...p, product_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input value={formData.quantity} onChange={(e) => handleInputChange("quantity", e.target.value)} type="number" step="any" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price Per Unit (₹)</Label>
              <Input value={formData.price_per_unit} onChange={(e) => handleInputChange("price_per_unit", e.target.value)} type="number" step="any" />
            </div>
            <div>
              <Label>Total Amount (₹)</Label>
              <Input value={formData.total_amount} onChange={(e) => handleInputChange("total_amount", e.target.value)} type="number" step="any" />
            </div>
          </div>

          <div>
            <Label>Debit Wallet</Label>
            <Select value={formData.wallet_id} onValueChange={(v) => setFormData((p) => ({ ...p, wallet_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {wallets?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.wallet_name} — {Number(w.current_balance ?? 0).toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Payment Method</Label>
            <Select value={formData.sales_payment_method_id} onValueChange={(v) => setFormData((p) => ({ ...p, sales_payment_method_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
              <SelectContent>
                {paymentMethods?.map((pm: any) => (
                  <SelectItem key={pm.id} value={pm.id}>
                    {pm.method_name} {pm.bank_accounts ? `(${pm.bank_accounts.bank_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitMutation.isPending} className="flex-1">
              {submitMutation.isPending ? "Creating..." : "Create Sales Entry"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
