
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";

export function DirectoryTab() {
  // Fetch all transactions
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['all_bank_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });
      
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
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'text-green-700';
      case 'EXPENSE':
        return 'text-red-700';
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return 'text-blue-700';
      default:
        return 'text-gray-700';
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'default';
      case 'EXPENSE':
        return 'destructive';
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Loading transactions...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            All Bank Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!transactions || transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-full">
                      {getTransactionIcon(transaction.transaction_type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {transaction.bank_accounts?.account_name} - {transaction.bank_accounts?.bank_name}
                        </span>
                        <Badge variant={getBadgeVariant(transaction.transaction_type)}>
                          {transaction.transaction_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}
                        {transaction.category && ` • ${transaction.category}`}
                      </div>
                      {transaction.description && (
                        <div className="text-sm text-gray-500">{transaction.description}</div>
                      )}
                      {transaction.related_account_name && (
                        <div className="text-sm text-blue-600">
                          Transfer: {transaction.related_account_name}
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
                      {transaction.transaction_type === 'EXPENSE' || transaction.transaction_type === 'TRANSFER_OUT' ? '-' : '+'}
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
