
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionSummaryProps {
  transactions: any[];
}

export function TransactionSummary({ transactions }: TransactionSummaryProps) {
  const totalIncomes = transactions
    ?.filter(t => t.transaction_type === "INCOME")
    .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0;

  const totalExpenses = transactions
    ?.filter(t => t.transaction_type === "EXPENSE")
    .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0;

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Total Incomes</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">₹{totalIncomes.toLocaleString()}</div>
            <p className="text-xs text-green-600">
              {transactions?.filter(t => t.transaction_type === "INCOME").length || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">₹{totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-red-600">
              {transactions?.filter(t => t.transaction_type === "EXPENSE").length || 0} transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net Balance */}
      <Card className={cn(
        "border-2",
        totalIncomes - totalExpenses >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      )}>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className={cn(
              "text-3xl font-bold",
              totalIncomes - totalExpenses >= 0 ? "text-green-700" : "text-red-700"
            )}>
              ₹{(totalIncomes - totalExpenses).toLocaleString()}
            </div>
            <p className="text-sm text-gray-600 mt-1">Net Balance</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
