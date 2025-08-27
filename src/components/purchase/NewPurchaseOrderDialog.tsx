import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductSelectionSection } from "./ProductSelectionSection";

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
}

export function NewPurchaseOrderDialog({ open, onOpenChange }: NewPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
    tds_applied: false,
    pan_number: "",
  });

  const [productItems, setProductItems] = useState<ProductItem[]>([]);

  // Calculate amounts
  const totalAmount = productItems.reduce((total, item) => total + (item.quantity * item.unit_price), 0);
  const tdsAmount = formData.tds_applied ? totalAmount * 0.01 : 0; // 1% TDS
  const netPayableAmount = formData.tds_applied ? totalAmount - tdsAmount : totalAmount;

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
      
      // Create purchase order
      const { data: purchaseOrder, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: orderData.order_number,
          supplier_name: orderData.supplier_name,
          contact_number: orderData.contact_number,
          description: orderData.description,
          payment_method_type: orderData.payment_method_type,
          upi_id: orderData.upi_id,
          bank_account_number: orderData.bank_account_number,
          bank_account_name: orderData.bank_account_name,
          ifsc_code: orderData.ifsc_code,
          assigned_to: orderData.assigned_to,
          total_amount: totalAmount,
          tds_applied: orderData.tds_applied,
          pan_number: orderData.pan_number,
          tds_amount: tdsAmount,
          net_payable_amount: netPayableAmount,
          tax_amount: tdsAmount,
          order_date: orderData.order_date,
          created_by: user?.id,
          status: 'PENDING'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create purchase order items
      if (productItems.length > 0) {
        const orderItems = productItems.map(item => ({
          purchase_order_id: purchaseOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
          warehouse_id: item.warehouse_id
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(orderItems);

        if (itemsError) throw itemsError;
      }

      // Create TDS record if TDS is applied
      if (orderData.tds_applied) {
        const currentYear = new Date().getFullYear();
        const financialYear = `${currentYear}-${currentYear + 1}`;
        
        const { error: tdsError } = await supabase
          .from('tds_records')
          .insert({
            purchase_order_id: purchaseOrder.id,
            pan_number: orderData.pan_number,
            total_amount: totalAmount,
            tds_rate: 1.0,
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
            });
        }
      } catch (txErr) {
        console.warn('Bank transaction creation skipped:', txErr);
      }

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
      tds_applied: false,
      pan_number: "",
    });
    setProductItems([]);
  };

  // Auto-fill contact number when supplier is selected from clients
  const handleSupplierChange = (supplierName: string) => {
    setFormData(prev => ({ ...prev, supplier_name: supplierName }));
    
    const selectedClient = clients?.find(client => client.name === supplierName);
    if (selectedClient) {
      setFormData(prev => ({ 
        ...prev, 
        contact_number: selectedClient.phone || "" 
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.contact_number.trim()) {
      toast({
        title: "Error",
        description: "Contact number is mandatory.",
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

    if (formData.tds_applied && !formData.pan_number.trim()) {
      toast({
        title: "Error",
        description: "PAN number is mandatory when TDS is applied.",
        variant: "destructive",
      });
      return;
    }

    createPurchaseOrderMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="supplier_name">Supplier Name *</Label>
              <Select onValueChange={handleSupplierChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select or type supplier name" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.name}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="mt-2"
                placeholder="Or enter new supplier name"
                value={formData.supplier_name}
                onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="contact_number">Contact Number *</Label>
              <Input
                id="contact_number"
                value={formData.contact_number}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                required
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

          {/* TDS Section */}
          <div className="space-y-4 border rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="tds_applied"
                checked={formData.tds_applied}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, tds_applied: !!checked }))}
              />
              <Label htmlFor="tds_applied" className="text-lg font-semibold">TDS Applied (1%)</Label>
            </div>

            {formData.tds_applied && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pan_number">PAN Number *</Label>
                  <Input
                    id="pan_number"
                    value={formData.pan_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, pan_number: e.target.value.toUpperCase() }))}
                    placeholder="Enter PAN number"
                    required={formData.tds_applied}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>TDS Amount (1%):</span>
                    <span className="font-semibold">₹{tdsAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Net Payable Amount:</span>
                    <span>₹{netPayableAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPurchaseOrderMutation.isPending}>
              {createPurchaseOrderMutation.isPending ? "Creating..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
