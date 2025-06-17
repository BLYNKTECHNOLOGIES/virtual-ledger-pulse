import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRightLeft, Download } from "lucide-react";

export function DirectoryTab() {
  // Fetch all transactions (bank, sales, purchases)
  const { data: allTransactions, isLoading } = useQuery({
    queryKey: ['all_transactions'],
    queryFn: async () => {
      // Bank transactions
      const { data: bankData, error: bankError } = await supabase
        .from('bank_transactions')
        .select(`
          id,
          amount,
          transaction_date,
          transaction_type,
          description,
          category,
          reference_number,
          related_account_name,
          created_at,
          bank_accounts!bank_account_id(account_name, bank_name, id)
        `)
        .order('transaction_date', { ascending: false });

      if (bankError) throw bankError;

      // Sales orders
      const { data: salesData, error: salesError } = await supabase
        .from('sales_orders')
        .select(`
          id,
          amount,
          order_date,
          order_number,
          client_name,
          description,
          status,
          created_at,
          sales_payment_methods(type, bank_accounts(account_name, bank_name, id))
        `)
        .order('order_date', { ascending: false });

      if (salesError) throw salesError;

      // Purchase orders with bank account details
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          total_amount,
          order_date,
          order_number,
          supplier_name,
          description,
          status,
          created_at,
          bank_accounts!bank_account_id(account_name, bank_name, id)
        `)
        .order('order_date', { ascending: false });

      if (purchaseError) throw purchaseError;

      // Combine and format all transactions
      const combinedTransactions = [
        ...(bankData || []).map(t => ({
          ...t,
          source: 'BANK',
          display_amount: t.amount,
          display_date: t.transaction_date,
          display_type: t.transaction_type,
          display_description: t.description || '',
          display_reference: t.reference_number || '',
          display_account: t.bank_accounts?.account_name + ' - ' + t.bank_accounts?.bank_name,
          bank_account_id: t.bank_accounts?.id
        })),
        ...(salesData || []).map(s => ({
          ...s,
          source: 'SALES',
          display_amount: s.amount,
          display_date: s.order_date,
          display_type: 'SALES_ORDER',
          display_description: `Stock Sold - ${s.client_name} - Order #${s.order_number}${s.description ? ': ' + s.description : ''}`,
          display_reference: s.order_number,
          display_account: s.sales_payment_methods?.bank_accounts?.account_name ? 
            s.sales_payment_methods.bank_accounts.account_name + ' - ' + s.sales_payment_methods.bank_accounts.bank_name : 
            s.sales_payment_methods?.type || 'Not Specified',
          bank_account_id: s.sales_payment_methods?.bank_accounts?.id
        })),
        ...(purchaseData || []).map(p => ({
          ...p,
          source: 'PURCHASE',
          display_amount: p.total_amount,
          display_date: p.order_date,
          display_type: 'PURCHASE_ORDER',
          display_description: `Stock Purchase - ${p.supplier_name} - Order #${p.order_number}${p.description ? ': ' + p.description : ''}`,
          display_reference: p.order_number,
          display_account: p.bank_accounts?.account_name && p.bank_accounts?.bank_name ? 
            `${p.bank_accounts.account_name} - ${p.bank_accounts.bank_name}` : 
            'Bank Account Not Specified',
          bank_account_id: p.bank_accounts?.id
        }))
      ];

      // Sort by date
      return combinedTransactions.sort((a, b) => 
        new Date(b.display_date).getTime() - new Date(a.display_date).getTime()
      );
    },
  });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
      case 'SALES_ORDER':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'EXPENSE':
      case 'PURCHASE_ORDER':
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
      case 'SALES_ORDER':
        return 'text-green-700';
      case 'EXPENSE':
      case 'PURCHASE_ORDER':
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
      case 'SALES_ORDER':
        return 'default';
      case 'EXPENSE':
      case 'PURCHASE_ORDER':
        return 'destructive';
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const downloadCSV = () => {
    if (!allTransactions || allTransactions.length === 0) return;

    const csvHeaders = [
      'Source',
      'Type',
      'Date',
      'Amount',
      'Description',
      'Reference',
      'Bank Account',
      'Created At'
    ];

    const csvData = allTransactions.map(transaction => [
      transaction.source,
      transaction.display_type.replace('_', ' '),
      format(new Date(transaction.display_date), 'MMM dd, yyyy'),
      transaction.display_amount,
      transaction.display_description,
      transaction.display_reference,
      transaction.display_account,
      format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directory_transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
      {/* Transactions List */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              All Transactions Directory
              <Badge variant="secondary">{allTransactions?.length || 0} entries</Badge>
            </CardTitle>
            <Button 
              variant="outline" 
              onClick={downloadCSV} 
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Data
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!allTransactions || allTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found
            </div>
          ) : (
            <div className="space-y-4">
              {allTransactions.map((transaction) => (
                <div
                  key={`${transaction.source}-${transaction.id}`}
                  className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-full">
                      {getTransactionIcon(transaction.display_type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{transaction.display_account}</span>
                        <Badge variant={getBadgeVariant(transaction.display_type)}>
                          {transaction.display_type.replace('_', ' ')}
                        </Badge>
                        <Badge variant="outline">{transaction.source}</Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(new Date(transaction.display_date), "MMM dd, yyyy")}
                      </div>
                      {transaction.display_description && (
                        <div className="text-sm text-gray-500">{transaction.display_description}</div>
                      )}
                      {transaction.display_reference && (
                        <div className="text-xs text-gray-400">
                          Ref: {transaction.display_reference}
                        </div>
                      )}
                      {transaction.source === 'PURCHASE' && (
                        <div className="text-xs text-blue-600 font-medium">
                          Payment from: {transaction.display_account}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold text-lg ${getTransactionColor(transaction.display_type)}`}>
                      {transaction.display_type === 'EXPENSE' || transaction.display_type === 'TRANSFER_OUT' || transaction.display_type === 'PURCHASE_ORDER' ? '-' : '+'}
                      ₹{parseFloat(transaction.display_amount.toString()).toLocaleString()}
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
