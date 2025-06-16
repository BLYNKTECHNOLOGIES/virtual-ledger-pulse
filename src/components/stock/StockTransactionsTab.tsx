
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function StockTransactionsTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['stock_transactions', searchTerm, filterType],
    queryFn: async () => {
      let query = supabase
        .from('stock_transactions')
        .select(`
          *,
          products(name, code, unit_of_measurement)
        `)
        .order('transaction_date', { ascending: false });

      if (searchTerm) {
        query = query.or(`supplier_customer_name.ilike.%${searchTerm}%,reference_number.ilike.%${searchTerm}%`);
      }

      if (filterType !== "all") {
        query = query.eq('transaction_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Also fetch purchase order items to show purchase entries
  const { data: purchaseEntries } = useQuery({
    queryKey: ['purchase_stock_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          purchase_orders(order_number, supplier_name, order_date),
          products(name, code, unit_of_measurement)
        `)
        .order('id', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return <Badge className="bg-green-100 text-green-800">Stock In</Badge>;
      case 'OUT':
        return <Badge className="bg-red-100 text-red-800">Stock Out</Badge>;
      case 'PURCHASE':
        return <Badge className="bg-blue-100 text-blue-800">Purchase</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  // Combine transactions and purchase entries
  const allEntries = [
    ...(transactions || []).map(t => ({
      ...t,
      type: 'transaction',
      date: t.transaction_date,
      supplier_name: t.supplier_customer_name
    })),
    ...(purchaseEntries || []).map(p => ({
      ...p,
      type: 'purchase',
      transaction_type: 'PURCHASE',
      date: p.purchase_orders?.order_date,
      supplier_name: p.purchase_orders?.supplier_name,
      reference_number: p.purchase_orders?.order_number,
      total_amount: p.total_price
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Stock Transactions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by supplier or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="IN">Stock In</SelectItem>
                <SelectItem value="OUT">Stock Out</SelectItem>
                <SelectItem value="PURCHASE">Purchase Orders</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading transactions...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Unit Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Total Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Supplier/Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {allEntries?.map((entry, index) => (
                    <tr key={`${entry.type}-${entry.id}-${index}`} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{format(new Date(entry.date), 'dd/MM/yyyy')}</td>
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{entry.products?.name}</div>
                          <div className="text-sm text-gray-500">{entry.products?.code}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getTransactionBadge(entry.transaction_type)}
                      </td>
                      <td className="py-3 px-4">{entry.quantity} {entry.products?.unit_of_measurement}</td>
                      <td className="py-3 px-4">₹{entry.unit_price || 0}</td>
                      <td className="py-3 px-4">₹{entry.total_amount || 0}</td>
                      <td className="py-3 px-4">{entry.supplier_name || '-'}</td>
                      <td className="py-3 px-4">{entry.reference_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {allEntries?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No stock transactions found.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
