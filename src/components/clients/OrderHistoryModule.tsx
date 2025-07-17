
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { History, Search, Download, Filter, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";
import { useState } from "react";

interface OrderHistoryModuleProps {
  clientId?: string;
}

export function OrderHistoryModule({ clientId }: OrderHistoryModuleProps) {
  const params = useParams();
  const activeClientId = clientId || params.clientId;
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch client data first
  const { data: client } = useQuery({
    queryKey: ['client', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', activeClientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!activeClientId,
  });

  // Fetch client's orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ['client-orders-history', activeClientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const { data, error } = await supabase
        .from('sales_orders')
        .select('*')
        .or(`client_name.eq.${client.name},client_phone.eq.${client.phone}`)
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId && !!client,
  });

  // Filter orders based on search term
  const filteredOrders = orders?.filter(order => 
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.platform?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusBadge = (status: string, paymentStatus: string) => {
    if (status === 'COMPLETED' && paymentStatus === 'COMPLETED') {
      return <Badge className="text-green-700 bg-green-100 border-green-300">Completed</Badge>;
    }
    if (status === 'PENDING') {
      return <Badge className="text-yellow-700 bg-yellow-100 border-yellow-300">Processing</Badge>;
    }
    if (status === 'CANCELLED') {
      return <Badge className="text-red-700 bg-red-100 border-red-300">Cancelled</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const getOrderTypeBadge = () => {
    // For now, assuming all orders are "Buy" orders since this is sales_orders table
    return <Badge className="text-green-700 bg-green-100 border-green-300">Buy</Badge>;
  };

  if (!client) {
    return (
      <Card className="shadow-lg border-0 bg-gradient-to-br from-gray-50 to-blue-50">
        <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History Module
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Select a client to view order history
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-gray-50 to-blue-50">
      <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History Module - {client.name}
          </CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input 
                placeholder="Search orders..." 
                className="pl-10 w-48 bg-white/90 border-gray-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" className="bg-white/90 text-gray-700 border-gray-300 hover:bg-white">
              <Filter className="h-4 w-4 mr-1" />
              Filter
            </Button>
            <Button size="sm" variant="outline" className="bg-white/90 text-gray-700 border-gray-300 hover:bg-white">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="animate-pulse">Loading order history...</div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No orders found for this client
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">Order Number</TableHead>
                  <TableHead className="font-semibold text-gray-700">Date</TableHead>
                  <TableHead className="font-semibold text-gray-700">Type</TableHead>
                  <TableHead className="font-semibold text-gray-700">Description</TableHead>
                  <TableHead className="font-semibold text-gray-700">Quantity</TableHead>
                  <TableHead className="font-semibold text-gray-700">Amount</TableHead>
                  <TableHead className="font-semibold text-gray-700">Platform</TableHead>
                  <TableHead className="font-semibold text-gray-700">Status</TableHead>
                  <TableHead className="font-semibold text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order, index) => (
                  <TableRow key={order.id} className="hover:bg-blue-50/50 border-b border-gray-100">
                    <TableCell className="font-medium text-blue-600 font-mono">
                      {order.order_number}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {new Date(order.order_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {getOrderTypeBadge()}
                    </TableCell>
                    <TableCell className="text-gray-700 max-w-32 truncate">
                      {order.description || 'USDT Purchase'}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {order.quantity}
                    </TableCell>
                    <TableCell className="font-semibold text-gray-800">
                      ₹{order.total_amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {order.platform || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(order.status, order.payment_status)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="text-blue-600 hover:bg-blue-50">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
