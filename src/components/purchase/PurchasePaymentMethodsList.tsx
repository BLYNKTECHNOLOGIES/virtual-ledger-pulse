
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Building, AlertTriangle } from "lucide-react";

interface PurchasePaymentMethod {
  id: string;
  type: "UPI" | "Bank Transfer";
  bank_account_id: string;
  payment_limit: number;
  current_usage: number;
  frequency: string;
  custom_frequency?: string;
  is_active: boolean;
  created_at: string;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC: string;
  balance: number;
  status: string;
}

export function PurchasePaymentMethodsList() {
  // Fetch purchase payment methods
  const { data: purchasePaymentMethods, isLoading: methodsLoading } = useQuery({
    queryKey: ['purchase_payment_methods_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PurchasePaymentMethod[];
    },
  });

  // Fetch bank accounts
  const { data: bankAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['bank_accounts_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name');
      
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const getBankAccountInfo = (bankAccountId: string) => {
    return bankAccounts?.find(account => account.id === bankAccountId);
  };

  const getAvailableLimit = (method: PurchasePaymentMethod) => {
    return method.payment_limit - method.current_usage;
  };

  const getUsagePercentage = (method: PurchasePaymentMethod) => {
    return (method.current_usage / method.payment_limit) * 100;
  };

  if (methodsLoading || accountsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading payment methods...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Purchase Payment Methods</CardTitle>
        <p className="text-sm text-gray-600">
          Complete list of configured purchase payment methods with bank account details
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Bank Name</TableHead>
                <TableHead>Account Number</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>IFSC</TableHead>
                <TableHead>Bank Balance</TableHead>
                <TableHead>Payment Limit</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Usage %</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchasePaymentMethods?.map((method) => {
                const bankAccount = getBankAccountInfo(method.bank_account_id);
                const usagePercentage = getUsagePercentage(method);
                const availableLimit = getAvailableLimit(method);
                
                return (
                  <TableRow key={method.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {method.type === "UPI" ? (
                          <Smartphone className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Building className="h-4 w-4 text-green-600" />
                        )}
                        <span className="font-medium">{method.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {bankAccount?.bank_name || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {bankAccount?.account_number || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {bankAccount?.account_name || "N/A"}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {bankAccount?.IFSC || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-medium ${
                        bankAccount && bankAccount.balance < 0 ? "text-red-600" : "text-green-600"
                      }`}>
                        ₹{bankAccount?.balance.toLocaleString() || "0"}
                      </span>
                      <div className="text-xs text-gray-500">
                        Status: {bankAccount?.status || "Unknown"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        ₹{method.payment_limit.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-orange-600">
                        ₹{method.current_usage.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-medium ${
                        availableLimit === 0 ? "text-red-600" : "text-green-600"
                      }`}>
                        ₹{availableLimit.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={usagePercentage} className="w-16" />
                        <span className="text-xs font-medium">
                          {usagePercentage.toFixed(0)}%
                        </span>
                        {usagePercentage >= 100 && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {method.frequency === "Custom" ? 
                          method.custom_frequency : 
                          method.frequency
                        }
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={method.is_active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {method.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {purchasePaymentMethods?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                    No purchase payment methods found. Please add payment methods first.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {purchasePaymentMethods && purchasePaymentMethods.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-sm mb-2">Summary:</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total Methods:</span>
                <span className="ml-2 font-medium">{purchasePaymentMethods.length}</span>
              </div>
              <div>
                <span className="text-gray-600">Active Methods:</span>
                <span className="ml-2 font-medium text-green-600">
                  {purchasePaymentMethods.filter(m => m.is_active).length}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Total Limit:</span>
                <span className="ml-2 font-medium">
                  ₹{purchasePaymentMethods
                    .filter(m => m.is_active)
                    .reduce((sum, m) => sum + m.payment_limit, 0)
                    .toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Total Available:</span>
                <span className="ml-2 font-medium text-green-600">
                  ₹{purchasePaymentMethods
                    .filter(m => m.is_active)
                    .reduce((sum, m) => sum + getAvailableLimit(m), 0)
                    .toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
