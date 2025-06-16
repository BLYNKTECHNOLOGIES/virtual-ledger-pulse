
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Smartphone, Building, Edit, Trash2, AlertTriangle } from "lucide-react";
import { PurchasePaymentMethod } from "./types";

interface PurchaseMethodsTableProps {
  purchasePaymentMethods: PurchasePaymentMethod[] | undefined;
  isLoading: boolean;
  onEdit: (method: PurchasePaymentMethod) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export function PurchaseMethodsTable({
  purchasePaymentMethods,
  isLoading,
  onEdit,
  onDelete,
  isDeleting
}: PurchaseMethodsTableProps) {
  const getAvailableLimit = (method: PurchasePaymentMethod) => {
    return method.payment_limit - method.current_usage;
  };

  const getUsagePercentage = (method: PurchasePaymentMethod) => {
    return (method.current_usage / method.payment_limit) * 100;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading purchase payment methods...</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Bank Account</TableHead>
          <TableHead>Limit</TableHead>
          <TableHead>Used</TableHead>
          <TableHead>Available</TableHead>
          <TableHead>Usage</TableHead>
          <TableHead>Frequency</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {purchasePaymentMethods?.map((method) => {
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
                  {method.type}
                </div>
              </TableCell>
              <TableCell>
                {method.bank_accounts ? (
                  <div className="flex flex-col">
                    <span className="font-medium">{method.bank_accounts.account_name}</span>
                    <span className="text-sm text-gray-500">
                      {method.bank_accounts.bank_name} - {method.bank_accounts.account_number}
                    </span>
                    <span className="text-sm text-green-600">
                      Balance: ₹{method.bank_accounts.balance.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">Bank account not found</span>
                )}
              </TableCell>
              <TableCell>₹{method.payment_limit.toLocaleString()}</TableCell>
              <TableCell>₹{method.current_usage.toLocaleString()}</TableCell>
              <TableCell className={availableLimit === 0 ? "text-red-600 font-medium" : ""}>
                ₹{availableLimit.toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={usagePercentage} className="w-16" />
                  <span className="text-xs">{usagePercentage.toFixed(0)}%</span>
                  {usagePercentage >= 100 && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </TableCell>
              <TableCell>
                {method.frequency === "Custom" ? method.custom_frequency : method.frequency}
              </TableCell>
              <TableCell>
                <Badge variant={method.is_active ? "default" : "secondary"}>
                  {method.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(method)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(method.id)}
                    className="text-red-600 hover:text-red-700"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {purchasePaymentMethods?.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="text-center py-8 text-gray-500">
              No purchase payment methods found. Add your first payment method to get started.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
