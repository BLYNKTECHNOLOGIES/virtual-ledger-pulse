
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface EditPayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payer: any;
}

interface PaymentMethod {
  id: string;
  bank_account_name: string;
  type: string;
  payment_limit: number;
}

export function EditPayerDialog({ open, onOpenChange, payer }: EditPayerDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    safe_funds: false,
    payer_type: "UPI" as "UPI" | "Bank Transfer",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
    payment_method_ids: [] as string[]
  });

  // Initialize form data when payer changes
  useEffect(() => {
    if (payer) {
      setFormData({
        safe_funds: payer.safe_funds,
        payer_type: payer.payer_type,
        status: payer.status,
        payment_method_ids: payer.payment_methods?.map((method: any) => method.id) || []
      });
    }
  }, [payer]);

  // Fetch available payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select('id, bank_account_name, type, payment_limit')
        .eq('is_active', true)
        .order('bank_account_name');

      if (error) throw error;
      return data || [];
    },
  });

  // Update payer mutation
  const updatePayerMutation = useMutation({
    mutationFn: async (payerData: typeof formData) => {
      // Update payer
      const { error: payerError } = await supabase
        .from('payers')
        .update({
          safe_funds: payerData.safe_funds,
          payer_type: payerData.payer_type,
          status: payerData.status
        })
        .eq('id', payer.id);

      if (payerError) throw payerError;

      // Delete existing payment method relationships
      const { error: deleteError } = await supabase
        .from('payer_payment_methods')
        .delete()
        .eq('payer_id', payer.id);

      if (deleteError) throw deleteError;

      // Insert new payment method relationships
      if (payerData.payment_method_ids.length > 0) {
        const { error: methodsError } = await supabase
          .from('payer_payment_methods')
          .insert(
            payerData.payment_method_ids.map(methodId => ({
              payer_id: payer.id,
              purchase_payment_method_id: methodId
            }))
          );

        if (methodsError) throw methodsError;
      }

      return payer.id;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payer updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error updating payer:', error);
      toast({ title: "Error", description: "Failed to update payer", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updatePayerMutation.mutate(formData);
  };

  const addPaymentMethod = (methodId: string) => {
    if (!formData.payment_method_ids.includes(methodId)) {
      setFormData(prev => ({
        ...prev,
        payment_method_ids: [...prev.payment_method_ids, methodId]
      }));
    }
  };

  const removePaymentMethod = (methodId: string) => {
    setFormData(prev => ({
      ...prev,
      payment_method_ids: prev.payment_method_ids.filter(id => id !== methodId)
    }));
  };

  const selectedMethods = paymentMethods?.filter(method => 
    formData.payment_method_ids.includes(method.id)
  ) || [];

  const availableMethods = paymentMethods?.filter(method => 
    !formData.payment_method_ids.includes(method.id)
  ) || [];

  if (!payer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Payer - {payer.employee?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">
              <strong>Employee:</strong> {payer.employee?.name} - {payer.employee?.employee_id}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Department:</strong> {payer.employee?.department}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payer_type">Payer Type *</Label>
              <Select value={formData.payer_type} onValueChange={(value: "UPI" | "Bank Transfer") => 
                setFormData(prev => ({ ...prev, payer_type: value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Payer Status</Label>
              <Select value={formData.status} onValueChange={(value: "ACTIVE" | "INACTIVE") => 
                setFormData(prev => ({ ...prev, status: value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="safe_funds"
              checked={formData.safe_funds}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, safe_funds: !!checked }))
              }
            />
            <Label htmlFor="safe_funds">Safe Funds</Label>
          </div>

          <div>
            <Label>Available Payment Methods</Label>
            <div className="space-y-3">
              {/* Selected Methods */}
              {selectedMethods.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-600">Selected Methods:</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedMethods.map((method) => (
                      <Badge key={method.id} variant="default" className="flex items-center gap-1">
                        {method.bank_account_name} ({method.type})
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => removePaymentMethod(method.id)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Method Selector */}
              {availableMethods.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-600">Add Payment Method:</Label>
                  <Select onValueChange={addPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a payment method to add" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMethods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.bank_account_name} ({method.type}) - Limit: ₹{method.payment_limit.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updatePayerMutation.isPending}>
              {updatePayerMutation.isPending ? "Updating..." : "Update Payer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
