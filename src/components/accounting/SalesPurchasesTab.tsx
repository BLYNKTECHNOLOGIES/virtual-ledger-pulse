
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function SalesPurchasesTab() {
  const { data: salesOrders, isLoading: salesLoading } = useQuery({
    queryKey: ['accounting-sales-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('id, order_number, client_name, total_amount, status, payment_status, order_date, quantity, price_per_unit, fee_amount, net_amount')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseOrders, isLoading: purchaseLoading } = useQuery({
    queryKey: ['accounting-purchase-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, order_number, supplier_name, total_amount, status, order_date, quantity, price_per_unit, fee_amount, net_amount, tds_amount')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const statusBadge = (status: string) => {
    const variant = status === 'COMPLETED' ? 'default' : status === 'PENDING' ? 'secondary' : 'outline';
    return <Badge variant={variant}>{status}</Badge>;
  };

  const formatCurrency = (amount: number | null) =>
    amount != null ? `₹${amount.toLocaleString('en-IN')}` : '—';

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Sales Transactions ({salesOrders?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : !salesOrders?.length ? (
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No sales transactions recorded</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesOrders.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                          <TableCell className="text-xs">{o.order_date ? format(new Date(o.order_date), 'dd MMM yyyy') : '—'}</TableCell>
                          <TableCell>{o.client_name || '—'}</TableCell>
                          <TableCell className="text-right">{o.quantity ?? '—'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(o.price_per_unit)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(o.total_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(o.fee_amount)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(o.net_amount)}</TableCell>
                          <TableCell>{statusBadge(o.status)}</TableCell>
                          <TableCell>{statusBadge(o.payment_status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                Purchase Transactions ({purchaseOrders?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {purchaseLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : !purchaseOrders?.length ? (
                <div className="text-center py-8">
                  <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No purchase transactions recorded</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead className="text-right">TDS</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                          <TableCell className="text-xs">{o.order_date ? format(new Date(o.order_date), 'dd MMM yyyy') : '—'}</TableCell>
                          <TableCell>{o.supplier_name || '—'}</TableCell>
                          <TableCell className="text-right">{o.quantity ?? '—'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(o.price_per_unit)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(o.total_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(o.fee_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(o.tds_amount)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(o.net_amount)}</TableCell>
                          <TableCell>{statusBadge(o.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
