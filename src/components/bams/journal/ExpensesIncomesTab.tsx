import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionSummary } from "./components/TransactionSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

export function ExpensesIncomesTab() {
  // Fetch bank accounts from Supabase (excluding dormant)
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch only bank transactions (no purchase orders) - exclude purchase-related transactions
  const { data: transactions } = useQuery({
    queryKey: ['bank_transactions_only'],
    queryFn: async () => {
      console.log('🔍 Fetching bank transactions for ExpensesIncomesTab...');
      
      // Fetch only bank transactions - exclude purchase-related ones
      const { data: bankData, error: bankError } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name),
          created_by_user:users!created_by(username, first_name, last_name),
          clients!client_id(id, name, client_id)
        `)
        .in('transaction_type', ['INCOME', 'EXPENSE'])
        .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading")') // Exclude core trading operations
        .order('created_at', { ascending: false });
      
      if (bankError) {
        console.error('❌ Bank transactions fetch error:', bankError);
        throw bankError;
      }
      
      console.log(`📊 Found ${bankData?.length || 0} bank transactions`);
      console.log('💳 Bank transactions sample:', bankData?.slice(0, 3));

      // Format transactions for display
      const formattedTransactions = (bankData || []).map(t => ({
        ...t,
        source: 'BANK',
        display_type: t.transaction_type,
        display_description: t.description || '',
        display_reference: t.reference_number || '',
        display_account: t.bank_accounts?.account_name + ' - ' + t.bank_accounts?.bank_name,
        display_client: t.clients?.name || null
      }));

      return formattedTransactions;
    },
    refetchInterval: 5000, // Refresh every 5 seconds to catch new transactions
    staleTime: 0,
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
      <PermissionGate permissions={["bams_manage"]} showFallback={false}>
        <TransactionForm bankAccounts={bankAccounts || []} />
      </PermissionGate>
      <TransactionSummary transactions={transactions || []} />
      
      {/* Recent Bank Transactions Only */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Recent Expenses & Incomes
            <Badge variant="secondary">{recentTransactions.length} recent entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recent transactions found
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-full">
                      {getTransactionIcon(transaction.transaction_type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {transaction.display_account || (transaction.bank_accounts?.account_name + ' - ' + transaction.bank_accounts?.bank_name)}
                        </span>
                        <Badge variant={getBadgeVariant(transaction.transaction_type)}>
                          {transaction.transaction_type}
                        </Badge>
                        {transaction.display_client && (
                          <Badge variant="outline" className="text-xs">
                            Client: {transaction.display_client}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}
                      </div>
                      {transaction.description && (
                        <div className="text-sm text-muted-foreground">{transaction.description}</div>
                      )}
                      {transaction.category && (
                        <div className="text-xs text-muted-foreground/70">
                          Category: {transaction.category}
                        </div>
                      )}
                      {transaction.reference_number && (
                        <div className="text-xs text-muted-foreground/70">
                          Ref: {transaction.reference_number}
                        </div>
                      )}
                      {transaction.created_by_user && (
                        <div className="text-xs text-primary font-medium">
                          By: {transaction.created_by_user.first_name || transaction.created_by_user.username}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold text-lg ${getTransactionColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type === 'EXPENSE' ? '-' : '+'}
                      ₹{parseFloat(transaction.amount.toString()).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
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