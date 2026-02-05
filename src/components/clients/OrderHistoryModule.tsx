import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, Search, Download, Filter, Eye, X, ShoppingCart, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";
import { useState } from "react";

interface OrderHistoryModuleProps {
  clientId?: string;
  showTabs?: boolean;
}

export function OrderHistoryModule({ clientId, showTabs = false }: OrderHistoryModuleProps) {
  const params = useParams();
  const activeClientId = clientId || params.clientId;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');

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

  // Fetch buy orders (sales_orders) - exclude cancelled
  const { data: buyOrders, isLoading: buyLoading } = useQuery({
    queryKey: ['client-buy-orders-history', activeClientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          *,
          wallet:wallets!wallet_id(wallet_name)
        `)
        .or(`client_name.eq.${client.name},client_phone.eq.${client.phone}`)
        .neq('status', 'CANCELLED')
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId && !!client,
  });

  // Fetch sell orders (purchase_orders) - exclude cancelled
  const { data: sellOrders, isLoading: sellLoading } = useQuery({
    queryKey: ['client-sell-orders-history', activeClientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (
            warehouse_id
          )
        `)
        .or(`supplier_name.eq.${client.name},contact_number.eq.${client.phone}`)
        .neq('status', 'CANCELLED')
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId && !!client,
  });

  // Fetch wallets for mapping warehouse_id to wallet_name
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
  });

  // Helper to get wallet name for sell orders (purchase_orders)
  const getPurchaseWalletName = (order: any) => {
    if (order.is_off_market) {
      return 'Off Market';
    }
    const walletId = order.purchase_order_items?.[0]?.warehouse_id;
    const wallet = wallets?.find(w => w.id === walletId);
    return wallet?.wallet_name || '-';
  };

  // Filter orders based on search term
  const filteredBuyOrders = buyOrders?.filter(order => 
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.platform?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredSellOrders = sellOrders?.filter(order => 
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusBadge = (status: string, paymentStatus?: string) => {
    if (status === 'COMPLETED' && (!paymentStatus || paymentStatus === 'COMPLETED')) {
      return <Badge className="bg-green-100 text-green-800 border-green-300">Completed</Badge>;
    }
    if (status === 'PENDING') {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Processing</Badge>;
    }
    if (status === 'CANCELLED') {
      return <Badge className="bg-red-100 text-red-800 border-red-300">Cancelled</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const handleViewOrder = (order: any, isBuyOrder: boolean) => {
    setSelectedOrder({ ...order, isBuyOrder });
    setIsViewDialogOpen(true);
  };

  if (!client) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History Module
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8 text-muted-foreground">
            Select a client to view order history
          </div>
        </CardContent>
      </Card>
    );
  }

  const isLoading = buyLoading || sellLoading;

  const renderOrderTable = (orders: any[], isBuyOrder: boolean) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Order Number</TableHead>
            <TableHead className="font-semibold">Date</TableHead>
            <TableHead className="font-semibold">Type</TableHead>
            <TableHead className="font-semibold">Description</TableHead>
            <TableHead className="font-semibold">Quantity</TableHead>
            <TableHead className="font-semibold">Amount</TableHead>
            <TableHead className="font-semibold">Platform</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="hover:bg-muted/30 border-b border-border">
              <TableCell className="font-medium text-primary font-mono">
                {order.order_number}
              </TableCell>
              <TableCell>
                {new Date(order.order_date).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {isBuyOrder ? (
                  <Badge className="bg-green-100 text-green-800">Buy</Badge>
                ) : (
                  <Badge className="bg-orange-100 text-orange-800">Sell</Badge>
                )}
              </TableCell>
              <TableCell className="max-w-32 truncate">
                {order.description || order.notes || 'USDT Transaction'}
              </TableCell>
              <TableCell>
                {order.quantity}
              </TableCell>
              <TableCell className="font-semibold">
                ₹{order.total_amount?.toLocaleString()}
              </TableCell>
              <TableCell>
                {isBuyOrder 
                  ? (order.wallet?.wallet_name || order.platform || 'Off Market')
                  : getPurchaseWalletName(order)
                }
              </TableCell>
              <TableCell>
                {getStatusBadge(order.status, order.payment_status)}
              </TableCell>
              <TableCell>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="text-primary hover:bg-primary/10"
                  onClick={() => handleViewOrder(order, isBuyOrder)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History - {client.name}
          </CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input 
                placeholder="Search orders..." 
                className="pl-10 w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline">
              <Filter className="h-4 w-4 mr-1" />
              Filter
            </Button>
            <Button size="sm" variant="outline">
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
        ) : showTabs ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'buy' | 'sell')} className="w-full">
            <div className="px-4 pt-2">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="buy" className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Buy Orders ({filteredBuyOrders.length})
                </TabsTrigger>
                <TabsTrigger value="sell" className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Sell Orders ({filteredSellOrders.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="buy" className="mt-0">
              {filteredBuyOrders.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  No buy orders found for this client
                </div>
              ) : (
                renderOrderTable(filteredBuyOrders, true)
              )}
            </TabsContent>
            <TabsContent value="sell" className="mt-0">
              {filteredSellOrders.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  No sell orders found for this client
                </div>
              ) : (
                renderOrderTable(filteredSellOrders, false)
              )}
            </TabsContent>
          </Tabs>
        ) : (
          // Show combined list if not composite
          filteredBuyOrders.length === 0 && filteredSellOrders.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No orders found for this client
            </div>
          ) : (
            renderOrderTable(
              [...filteredBuyOrders.map(o => ({ ...o, _isBuy: true })), 
               ...filteredSellOrders.map(o => ({ ...o, _isBuy: false }))]
                .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()),
              true // Will be overridden by _isBuy in the table
            )
          )
        )}
      </CardContent>

      {/* Order Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Order Details</span>
              <Button variant="ghost" size="sm" onClick={() => setIsViewDialogOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Order Number</Label>
                  <p className="text-lg font-mono text-primary">{selectedOrder.order_number}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Order Date</Label>
                  <p className="text-lg">{new Date(selectedOrder.order_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {selectedOrder.isBuyOrder ? 'Client Name' : 'Supplier Name'}
                  </Label>
                  <p className="text-lg">{selectedOrder.client_name || selectedOrder.supplier_name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                  <p className="text-lg">{selectedOrder.client_phone || selectedOrder.contact_number}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Quantity</Label>
                  <p className="text-lg">{selectedOrder.quantity}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Rate (₹)</Label>
                  <p className="text-lg">₹{selectedOrder.rate?.toLocaleString() || selectedOrder.price_per_unit?.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Total Amount</Label>
                  <p className="text-xl font-bold text-green-600">₹{selectedOrder.total_amount?.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Platform</Label>
                  <p className="text-lg">{selectedOrder.platform || 'N/A'}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                <p className="text-base bg-muted p-3 rounded-lg">{selectedOrder.description || selectedOrder.notes || 'USDT Transaction'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Order Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedOrder.status, selectedOrder.payment_status)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Order Type</Label>
                  {selectedOrder.isBuyOrder ? (
                    <Badge className="bg-green-100 text-green-800">Buy Order</Badge>
                  ) : (
                    <Badge className="bg-orange-100 text-orange-800">Sell Order</Badge>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button className="bg-primary hover:bg-primary/90">
                  <Download className="h-4 w-4 mr-2" />
                  Download Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
