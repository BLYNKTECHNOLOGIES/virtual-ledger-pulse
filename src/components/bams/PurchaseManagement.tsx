
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseMethodForm } from "./purchase/PurchaseMethodForm";
import { PurchaseSummaryCards } from "./purchase/PurchaseSummaryCards";
import { PurchaseMethodsTable } from "./purchase/PurchaseMethodsTable";
import { usePurchaseMethods } from "./purchase/usePurchaseMethods";
import { PurchasePaymentMethod, PurchaseMethodFormData } from "./purchase/types";

export function PurchaseManagement() {
  const {
    purchasePaymentMethods,
    bankAccounts,
    isLoading,
    createMethodMutation,
    updateMethodMutation,
    deleteMethodMutation,
  } = usePurchaseMethods();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PurchasePaymentMethod | null>(null);

  const handleSubmit = (formData: PurchaseMethodFormData) => {
    if (editingMethod) {
      updateMethodMutation.mutate({ ...formData, id: editingMethod.id });
    } else {
      createMethodMutation.mutate(formData);
    }
    setIsAddDialogOpen(false);
    setEditingMethod(null);
  };

  const handleEdit = (method: PurchasePaymentMethod) => {
    setEditingMethod(method);
    setIsAddDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this purchase payment method?")) {
      deleteMethodMutation.mutate(id);
    }
  };

  const handleCancel = () => {
    setIsAddDialogOpen(false);
    setEditingMethod(null);
  };

  // Validation function for purchase orders
  const validatePurchaseOrder = (amount: number) => {
    const getAvailableLimit = (method: PurchasePaymentMethod) => {
      return method.payment_limit - method.current_usage;
    };

    const getTotalAvailableUPI = () => {
      return purchasePaymentMethods
        ?.filter(m => m.type === "UPI" && m.is_active)
        .reduce((sum, m) => sum + getAvailableLimit(m), 0) || 0;
    };

    const getTotalAvailableBankTransfer = () => {
      return purchasePaymentMethods
        ?.filter(m => m.type === "Bank Transfer" && m.is_active)
        .reduce((sum, m) => sum + getAvailableLimit(m), 0) || 0;
    };

    const getTotalAccountBalance = () => {
      const linkedAccountIds = new Set(
        purchasePaymentMethods
          ?.filter(m => m.is_active)
          .map(m => m.bank_account_id)
      );
      
      return bankAccounts
        ?.filter(account => linkedAccountIds.has(account.id))
        .reduce((sum, account) => sum + account.balance, 0) || 0;
    };

    const totalAvailable = getTotalAvailableUPI() + getTotalAvailableBankTransfer();
    const totalBalance = getTotalAccountBalance();
    
    if (amount > totalBalance) {
      throw new Error(`Purchase amount (₹${amount.toLocaleString()}) exceeds total account balance (₹${totalBalance.toLocaleString()})`);
    }
    
    if (amount > totalAvailable) {
      throw new Error(`Purchase amount (₹${amount.toLocaleString()}) exceeds available payment limit (₹${totalAvailable.toLocaleString()})`);
    }
    
    return true;
  };

  // Expose validation function globally (if needed by other components)
  (window as any).validatePurchaseOrder = validatePurchaseOrder;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Management</h2>
          <p className="text-gray-600">Manage payment methods for company purchases</p>
        </div>
        <PurchaseMethodForm
          bankAccounts={bankAccounts}
          editingMethod={editingMethod}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={createMethodMutation.isPending || updateMethodMutation.isPending}
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
        />
      </div>

      <PurchaseSummaryCards 
        purchasePaymentMethods={purchasePaymentMethods}
        bankAccounts={bankAccounts}
      />

      <Card>
        <CardHeader>
          <CardTitle>Purchase Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseMethodsTable
            purchasePaymentMethods={purchasePaymentMethods}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deleteMethodMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
