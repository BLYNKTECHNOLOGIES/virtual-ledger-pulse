import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WalletSelector } from "@/components/stock/WalletSelector";

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

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
    payment_method_type: '',
    upi_id: '',
    bank_account_number: '',
    bank_account_name: '',
    ifsc_code: '',
    assigned_to: '',
    tds_option: 'NO_TDS',
    pan_number: '',
    quantity: 0,
    price_per_unit: 0,
    warehouse_id: '',
  });

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
    enabled: open,
  });

  useEffect(() => {
    if (order) {
      // Get quantity and price from order items if available
      const firstItem = order.purchase_order_items?.[0];
      const quantity = firstItem?.quantity || order.quantity || 0;
      const pricePerUnit = firstItem?.unit_price || order.price_per_unit || (order.total_amount / quantity) || 0;
      // Prefer direct wallet_id on order, fallback to purchase_order_items warehouse_id
      const warehouseId = order.wallet_id || order.wallet?.id || firstItem?.warehouse_id || '';

      // Determine TDS option from existing data
      let tdsOption = 'NO_TDS';
      if (order.tds_applied) {
        const tdsRate = order.tds_amount / order.total_amount;
        if (Math.abs(tdsRate - 0.01) < 0.001) {
          tdsOption = 'TDS_1_PERCENT';
        } else if (Math.abs(tdsRate - 0.20) < 0.001) {
          tdsOption = 'TDS_20_PERCENT';
        }
      }

      setFormData({
        order_number: order.order_number || '',
        supplier_name: order.supplier_name || '',
        contact_number: order.contact_number || '',
        total_amount: order.total_amount || 0,
        order_date: order.order_date || '',
        description: order.description || '',
        payment_method_type: order.payment_method_type || '',
        upi_id: order.upi_id || '',
        bank_account_number: order.bank_account_number || '',
        bank_account_name: order.bank_account_name || '',
        ifsc_code: order.ifsc_code || '',
        assigned_to: order.assigned_to || '',
        tds_option: tdsOption,
        pan_number: order.pan_number || '',
        quantity: quantity,
        price_per_unit: pricePerUnit,
        warehouse_id: warehouseId,
      });
    }
  }, [order]);

  // Calculate amounts based on TDS option
  const totalAmount = formData.quantity * formData.price_per_unit;
  const tdsRate = formData.tds_option === "TDS_1_PERCENT" ? 0.01 : formData.tds_option === "TDS_20_PERCENT" ? 0.20 : 0;
  const tdsAmount = totalAmount * tdsRate;
  const netPayableAmount = totalAmount - tdsAmount;
  const tdsApplied = formData.tds_option !== "NO_TDS";

  const updatePurchaseOrderMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Update the purchase order
      const { data: result, error } = await supabase
        .from('purchase_orders')
        .update({
          order_number: data.order_number,
          supplier_name: data.supplier_name,
          contact_number: data.contact_number,
          total_amount: totalAmount,
          order_date: data.order_date,
          description: data.description,
          payment_method_type: data.payment_method_type,
          upi_id: data.upi_id,
          bank_account_number: data.bank_account_number,
          bank_account_name: data.bank_account_name,
          ifsc_code: data.ifsc_code,
          assigned_to: data.assigned_to,
          tds_applied: tdsApplied,
          pan_number: data.pan_number,
          tds_amount: tdsAmount,
          net_payable_amount: netPayableAmount,
          wallet_id: data.warehouse_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .select()
        .single();

      if (error) throw error;

      // Update purchase order items if they exist
      if (order.purchase_order_items?.length > 0) {
        const firstItemId = order.purchase_order_items[0].id;
        await supabase
          .from('purchase_order_items')
          .update({
            quantity: data.quantity,
            unit_price: data.price_per_unit,
            total_price: totalAmount,
            warehouse_id: data.warehouse_id || null,
          })
          .eq('id', firstItemId);
      }

      return result;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Purchase order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['buy_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update purchase order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
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

    updatePurchaseOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Purchase Order - {order.order_number}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Order Number *</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Order Date *</Label>
              <Input
                type="date"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Supplier Name *</Label>
              <Input
                value={formData.supplier_name}
                onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={(e) => handleInputChange('contact_number', e.target.value)}
              />
            </div>

            <div>
              <Label>Assigned To</Label>
              <Select 
                value={formData.assigned_to} 
                onValueChange={(value) => handleInputChange('assigned_to', value)}
              >
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
              <WalletSelector
                value={formData.warehouse_id}
                onValueChange={(value) => handleInputChange('warehouse_id', value)}
                label="Wallet/Platform"
                placeholder="Select wallet..."
                filterByType="USDT"
              />
            </div>

            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Price Per Unit *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Total Amount</Label>
              <Input
                value={`₹${totalAmount.toFixed(2)}`}
                readOnly
                className="bg-muted font-semibold"
              />
            </div>
          </div>

          {/* TDS Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <Label className="text-lg font-semibold">TDS Options</Label>
            
            <Select 
              value={formData.tds_option} 
              onValueChange={(value) => handleInputChange('tds_option', value)}
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
                <Label>PAN Number *</Label>
                <Input
                  value={formData.pan_number}
                  onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
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

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          {/* Payment Method Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <Label className="text-lg font-semibold">Payment Method Details (Counterparty)</Label>
            
            <div>
              <Label>Payment Method Type</Label>
              <Select 
                value={formData.payment_method_type} 
                onValueChange={(value) => handleInputChange('payment_method_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.payment_method_type === "UPI" && (
              <div>
                <Label>UPI ID</Label>
                <Input
                  value={formData.upi_id}
                  onChange={(e) => handleInputChange('upi_id', e.target.value)}
                  placeholder="Enter counterparty UPI ID"
                />
              </div>
            )}

            {formData.payment_method_type === "BANK_TRANSFER" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bank Account Name</Label>
                  <Input
                    value={formData.bank_account_name}
                    onChange={(e) => handleInputChange('bank_account_name', e.target.value)}
                    placeholder="Account holder name"
                  />
                </div>
                <div>
                  <Label>Bank Account Number</Label>
                  <Input
                    value={formData.bank_account_number}
                    onChange={(e) => handleInputChange('bank_account_number', e.target.value)}
                    placeholder="Account number"
                  />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input
                    value={formData.ifsc_code}
                    onChange={(e) => handleInputChange('ifsc_code', e.target.value.toUpperCase())}
                    placeholder="IFSC code"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updatePurchaseOrderMutation.isPending}>
              {updatePurchaseOrderMutation.isPending ? "Updating..." : "Update Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
