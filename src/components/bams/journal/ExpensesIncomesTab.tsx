
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

  // Fetch transactions for summary (excluding purchase and sales order related transactions)
  const { data: transactions } = useQuery({
    queryKey: ['bank_transactions_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .in('transaction_type', ['INCOME', 'EXPENSE'])
        .not('category', 'eq', 'Purchase')
        .not('category', 'eq', 'Sales')
        .not('description', 'ilike', '%Purchase Order%')
        .not('description', 'ilike', '%Sales Order%')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent transactions for display
  const { data: recentTransactions } = useQuery({
    queryKey: ['recent_bank_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .in('transaction_type', ['INCOME', 'EXPENSE'])
        .not('category', 'eq', 'Purchase')
        .not('category', 'eq', 'Sales')
        .not('description', 'ilike', '%Purchase Order%')
        .not('description', 'ilike', '%Sales Order%')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

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

  return (
    <div className="space-y-6">
      <TransactionForm bankAccounts={bankAccounts || []} />
      <TransactionSummary transactions={transactions || []} />
      
      {/* Recent Transactions */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Recent Expenses & Incomes
            <Badge variant="secondary">{recentTransactions?.length || 0} entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!recentTransactions || recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recent transactions found
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
                        <span className="font-medium text-sm">
                          {transaction.bank_accounts?.account_name} - {transaction.bank_accounts?.bank_name}
                        </span>
                        <Badge variant={transaction.transaction_type === 'INCOME' ? 'default' : 'destructive'}>
                          {transaction.transaction_type}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-600">
                        {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}
                      </div>
                      {transaction.description && (
                        <div className="text-xs text-gray-500">{transaction.description}</div>
                      )}
                      {transaction.category && (
                        <div className="text-xs text-gray-400">
                          Category: {transaction.category}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${getTransactionColor(transaction.transaction_type)}`}>
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
