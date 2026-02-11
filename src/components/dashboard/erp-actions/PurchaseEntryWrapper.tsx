import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { SupplierAutocomplete } from "@/components/purchase/SupplierAutocomplete";
import { getCurrentUserId } from "@/lib/system-action-logger";

interface PurchaseEntryWrapperProps {
  item: ErpActionQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (refId?: string) => void;
}

export function PurchaseEntryWrapper({ item, open, onOpenChange, onSuccess }: PurchaseEntryWrapperProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    supplier_name: "",
    order_date: new Date().toISOString().split("T")[0],
    product_id: "",
    quantity: String(item.amount),
    price_per_unit: "",
    total_amount: "",
    credit_wallet_id: item.wallet_id || "",
    deduction_bank_account_id: "",
    tds_option: "none" as "none" | "1%" | "20%",
    pan_number: "",
    fee_percentage: "",
    description: `ERP Action: Deposit reconciliation (${item.tx_id || item.movement_id})`,
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

  // Auto-match product by asset code
  useEffect(() => {
    if (products && !formData.product_id) {
      const match = products.find(
        (p) => p.code?.toUpperCase() === item.asset.toUpperCase() || p.name?.toUpperCase() === item.asset.toUpperCase()
      );
      if (match) {
        setFormData((prev) => ({ ...prev, product_id: match.id }));
      }
    }
  }, [products, item.asset]);

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").eq("status", "ACTIVE");
      if (error) throw error;
      return data;
    },
  });

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ["wallets-with-details"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("id, wallet_name, wallet_type, chain_name, current_balance, fee_percentage, is_fee_enabled, is_active")
        .eq("is_active", true)
        .order("wallet_name");
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
      if (!formData.supplier_name) throw new Error("Supplier is required");
      if (!formData.product_id) throw new Error("Product is required");
      if (!formData.price_per_unit) throw new Error("Price is required");
      if (!formData.deduction_bank_account_id) throw new Error("Bank account is required");
      if (!formData.credit_wallet_id) throw new Error("Wallet is required");

      const { data: orderNumber } = await supabase.rpc("generate_off_market_purchase_order_number");
      const currentUserId = getCurrentUserId();

      const { data: result, error } = await supabase.rpc("create_manual_purchase_complete_v2", {
        p_order_number: orderNumber || `ERP-${Date.now()}`,
        p_supplier_name: formData.supplier_name,
        p_order_date: formData.order_date,
        p_total_amount: parseFloat(formData.total_amount) || 0,
        p_product_id: formData.product_id,
        p_quantity: parseFloat(formData.quantity),
        p_unit_price: parseFloat(formData.price_per_unit),
        p_bank_account_id: formData.deduction_bank_account_id,
        p_description: formData.description,
        p_credit_wallet_id: formData.credit_wallet_id,
        p_tds_option: formData.tds_option,
        p_pan_number: formData.pan_number || undefined,
        p_fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : undefined,
        p_is_off_market: true,
        p_created_by: currentUserId || undefined,
      });

      if (error) throw error;
      const res = result as any;
      if (res && !res.success) throw new Error(res.error || "Purchase creation failed");
      return { orderNumber, purchaseOrderId: res?.purchase_order_id };
    },
    onSuccess: (data) => {
      toast({ title: "Purchase Entry Created", description: `Order ${data.orderNumber} created.` });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
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
          <DialogTitle>Purchase Entry — {item.amount} {item.asset}</DialogTitle>
          <DialogDescription>Record this deposit as an asset purchase</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }} className="space-y-4">
          <div>
            <Label>Supplier / Seller</Label>
            <SupplierAutocomplete
              value={formData.supplier_name}
              onChange={(name) => setFormData((p) => ({ ...p, supplier_name: name }))}
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
            <Label>Credit Wallet</Label>
            <Select value={formData.credit_wallet_id} onValueChange={(v) => setFormData((p) => ({ ...p, credit_wallet_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {wallets?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.wallet_name} — {Number(w.current_balance ?? 0).toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Deduction Bank Account</Label>
            <Select value={formData.deduction_bank_account_id} onValueChange={(v) => setFormData((p) => ({ ...p, deduction_bank_account_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.account_name} - {b.bank_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>TDS</Label>
              <Select value={formData.tds_option} onValueChange={(v) => setFormData((p) => ({ ...p, tds_option: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No TDS</SelectItem>
                  <SelectItem value="1%">1% TDS</SelectItem>
                  <SelectItem value="20%">20% TDS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Date</Label>
              <Input type="date" value={formData.order_date} onChange={(e) => setFormData((p) => ({ ...p, order_date: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitMutation.isPending} className="flex-1">
              {submitMutation.isPending ? "Creating..." : "Create Purchase Entry"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
