
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Building, TrendingDown, Wallet } from "lucide-react";
import { PurchasePaymentMethod, BankAccount } from "./types";

interface PurchaseSummaryCardsProps {
  purchasePaymentMethods: PurchasePaymentMethod[] | undefined;
  bankAccounts: BankAccount[] | undefined;
}

export function PurchaseSummaryCards({ purchasePaymentMethods, bankAccounts }: PurchaseSummaryCardsProps) {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-600" />
            Available UPI Limit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            ₹{getTotalAvailableUPI().toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {purchasePaymentMethods?.filter(m => m.type === "UPI" && m.is_active).length || 0} active UPI methods
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building className="h-4 w-4 text-green-600" />
            Available Bank Transfer Limit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            ₹{getTotalAvailableBankTransfer().toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {purchasePaymentMethods?.filter(m => m.type === "Bank Transfer" && m.is_active).length || 0} active bank accounts
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-orange-600" />
            Total Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">
            ₹{getTotalAccountBalance().toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Linked bank accounts balance
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-purple-600" />
            Total Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">
            ₹{(getTotalAvailableUPI() + getTotalAvailableBankTransfer()).toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Combined purchasing power
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
