
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function StockTransactionsTab() {
  // Fetch stock transactions with product details
  const { data: stockTransactions, isLoading } = useQuery({
    queryKey: ['stock_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select(`
          *,
          products (
            name,
            code,
            unit_of_measurement
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const stockInTransactions = stockTransactions?.filter(t => t.transaction_type === 'IN') || [];
  const stockOutTransactions = stockTransactions?.filter(t => t.transaction_type === 'OUT') || [];
  const adjustmentTransactions = stockTransactions?.filter(t => t.transaction_type === 'ADJUSTMENT') || [];

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return <Badge className="bg-green-100 text-green-800">Stock In</Badge>;
      case 'OUT':
        return <Badge className="bg-red-100 text-red-800">Stock Out</Badge>;
      case 'ADJUSTMENT':
        return <Badge className="bg-yellow-100 text-yellow-800">Adjustment</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const TransactionTable = ({ transactions, emptyMessage }: { transactions: any[], emptyMessage: string }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-gray-200">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-200 p-3 text-left">Date</th>
            <th className="border border-gray-200 p-3 text-left">Product</th>
            <th className="border border-gray-200 p-3 text-left">Type</th>
            <th className="border border-gray-200 p-3 text-left">Quantity</th>
            <th className="border border-gray-200 p-3 text-left">Unit Price</th>
            <th className="border border-gray-200 p-3 text-left">Total Amount</th>
            <th className="border border-gray-200 p-3 text-left">Reference</th>
            <th className="border border-gray-200 p-3 text-left">Party Name</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-gray-50">
              <td className="border border-gray-200 p-3">
                {format(new Date(transaction.transaction_date), 'MMM dd, yyyy')}
              </td>
              <td className="border border-gray-200 p-3">
                <div>
                  <div className="font-medium">{transaction.products?.name}</div>
                  <div className="text-sm text-gray-500">{transaction.products?.code}</div>
                </div>
              </td>
              <td className="border border-gray-200 p-3">
                {getTransactionBadge(transaction.transaction_type)}
              </td>
              <td className="border border-gray-200 p-3">
                {transaction.quantity} {transaction.products?.unit_of_measurement}
              </td>
              <td className="border border-gray-200 p-3">
                {transaction.unit_price ? `₹${transaction.unit_price}` : '-'}
              </td>
              <td className="border border-gray-200 p-3">
                {transaction.total_amount ? `₹${transaction.total_amount}` : '-'}
              </td>
              <td className="border border-gray-200 p-3">
                {transaction.reference_number || '-'}
              </td>
              <td className="border border-gray-200 p-3">
                {transaction.supplier_customer_name || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {transactions.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {emptyMessage}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">Loading stock transactions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="in" className="space-y-4">
        <TabsList>
          <TabsTrigger value="in">Stock In (Purchases)</TabsTrigger>
          <TabsTrigger value="out">Stock Out (Sales)</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="history">All Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Stock In (Purchases)
                </CardTitle>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stock In
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <TransactionTable 
                transactions={stockInTransactions}
                emptyMessage="No stock in transactions recorded"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Stock Out (Sales)
                </CardTitle>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stock Out
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <TransactionTable 
                transactions={stockOutTransactions}
                emptyMessage="No stock out transactions recorded"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <CardTitle>Stock Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionTable 
                transactions={adjustmentTransactions}
                emptyMessage="No stock adjustments recorded"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>All Stock Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionTable 
                transactions={stockTransactions || []}
                emptyMessage="No transactions found"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
