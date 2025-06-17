
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionSummary } from "./components/TransactionSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";

export function ExpensesIncomesTab() {
  // Fetch bank accounts from Supabase
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch only manual income/expense transactions (excluding buy and sales orders)
  const { data: transactions } = useQuery({
    queryKey: ['bank_transactions_manual_only'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .in('transaction_type', ['INCOME', 'EXPENSE'])
        .or('category.neq.Purchase,category.is.null')
        .not('description', 'like', '%Order Payment%')
        .not('description', 'like', '%Stock Sold%')
        .not('description', 'like', '%Stock Purchase%')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Get recent transactions (last 10)
  const recentTransactions = transactions?.slice(0, 10) || [];

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'EXPENSE':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'text-green-700';
      case 'EXPENSE':
        return 'text-red-700';
      default:
        return 'text-blue-700';
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'default';
      case 'EXPENSE':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <TransactionForm bankAccounts={bankAccounts || []} />
      <TransactionSummary transactions={transactions || []} />
      
      {/* Recent Manual Transactions */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Recent Manual Expenses & Incomes
            <Badge variant="secondary">{recentTransactions.length} recent entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recent manual transactions found
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-full">
                      {getTransactionIcon(transaction.transaction_type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {transaction.bank_accounts?.account_name} - {transaction.bank_accounts?.bank_name}
                        </span>
                        <Badge variant={getBadgeVariant(transaction.transaction_type)}>
                          {transaction.transaction_type}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}
                      </div>
                      {transaction.description && (
                        <div className="text-sm text-gray-500">{transaction.description}</div>
                      )}
                      {transaction.category && (
                        <div className="text-xs text-gray-400">
                          Category: {transaction.category}
                        </div>
                      )}
                      {transaction.reference_number && (
                        <div className="text-xs text-gray-400">
                          Ref: {transaction.reference_number}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold text-lg ${getTransactionColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type === 'EXPENSE' ? '-' : '+'}
                      ₹{parseFloat(transaction.amount.toString()).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(transaction.created_at), "HH:mm")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
