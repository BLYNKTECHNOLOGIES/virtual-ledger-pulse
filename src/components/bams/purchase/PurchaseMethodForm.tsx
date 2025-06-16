
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { PurchasePaymentMethod, BankAccount, PurchaseMethodFormData } from "./types";

interface PurchaseMethodFormProps {
  bankAccounts: BankAccount[] | undefined;
  editingMethod: PurchasePaymentMethod | null;
  onSubmit: (data: PurchaseMethodFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseMethodForm({
  bankAccounts,
  editingMethod,
  onSubmit,
  onCancel,
  isSubmitting,
  isOpen,
  onOpenChange
}: PurchaseMethodFormProps) {
  const [formData, setFormData] = useState<PurchaseMethodFormData>({
    type: editingMethod?.type || "Bank Transfer",
    bank_account_id: editingMethod?.bank_account_id || "",
    payment_limit: editingMethod?.payment_limit.toString() || "",
    frequency: editingMethod?.frequency || "24 hours",
    custom_frequency: editingMethod?.custom_frequency || "",
    is_active: editingMethod?.is_active ?? true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const resetForm = () => {
    setFormData({
      type: "Bank Transfer",
      bank_account_id: "",
      payment_limit: "",
      frequency: "24 hours",
      custom_frequency: "",
      is_active: true
    });
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      resetForm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Purchase Method
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingMethod ? "Edit Purchase Method" : "Add New Purchase Method"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="type">Payment Method Type *</Label>
            <Select value={formData.type} onValueChange={(value: "UPI" | "Bank Transfer") => 
              setFormData(prev => ({ ...prev, type: value }))
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI Payment</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer (IMPS/NEFT)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="bank_account_id">Select Bank Account *</Label>
            <Select value={formData.bank_account_id} onValueChange={(value) => 
              setFormData(prev => ({ ...prev, bank_account_id: value }))
            }>
              <SelectTrigger>
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{account.account_name}</span>
                      <span className="text-sm text-gray-500">
                        {account.bank_name} - {account.account_number} ({account.IFSC})
                      </span>
                      <span className="text-sm text-green-600">
                        Balance: ₹{account.balance.toLocaleString()}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="payment_limit">Payment Limit (₹) *</Label>
            <Input
              id="payment_limit"
              type="number"
              min="0"
              step="0.01"
              value={formData.payment_limit}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_limit: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="frequency">Reset Frequency *</Label>
            <Select value={formData.frequency} onValueChange={(value: "24 hours" | "Daily" | "48 hours" | "Custom") => 
              setFormData(prev => ({ ...prev, frequency: value }))
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24 hours">24 Hours</SelectItem>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="48 hours">48 Hours</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.frequency === "Custom" && (
            <div>
              <Label htmlFor="custom_frequency">Custom Frequency *</Label>
              <Input
                id="custom_frequency"
                value={formData.custom_frequency}
                onChange={(e) => setFormData(prev => ({ ...prev, custom_frequency: e.target.value }))}
                placeholder="e.g., 72 hours, Weekly"
                required={formData.frequency === "Custom"}
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
            />
            <Label htmlFor="is_active">Active Payment Method</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Processing..." : (editingMethod ? "Update Method" : "Add Method")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
