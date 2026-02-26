import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, RefreshCw, Search, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePayerOrders } from '@/hooks/usePayerModule';
import { PayerOrderRow } from '@/components/terminal/payer/PayerOrderRow';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { format } from 'date-fns';

function mapOrderStatusCode(code: number | string): string {
  const map: Record<string, string> = {
    '1': 'PENDING',
    '2': 'PAYING',
    '3': 'PAID',
    '4': 'COMPLETED',
    '5': 'COMPLETED',
    '6': 'CANCELLED',
    '7': 'APPEAL',
    '8': 'EXPIRED',
  };
  const str = String(code);
  return map[str] || str.toUpperCase();
}

export default function TerminalPayer() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const { orders, completedOrders, isLoading, isFetching, refetch, exclusions } = usePayerOrders();

  const currentOrders = activeTab === 'pending' ? orders : completedOrders;

  const filteredOrders = useMemo(() => {
    if (!search) return currentOrders;
    const q = search.toLowerCase();
    return currentOrders.filter((o: any) => {
      const nick = o.sellerNickname || o.counterPartNickName || '';
      return nick.toLowerCase().includes(q) || (o.orderNumber || '').includes(q);
    });
  }, [currentOrders, search]);

  if (selectedOrder) {
    // Build a minimal P2POrderRecord-like shape for OrderDetailWorkspace
    const record = {
      id: selectedOrder.orderNumber,
      binance_order_number: selectedOrder.orderNumber,
      binance_adv_no: selectedOrder.advNo || null,
      counterparty_id: null,
      counterparty_nickname: selectedOrder.sellerNickname || selectedOrder.counterPartNickName || '',
      trade_type: 'BUY',
      asset: selectedOrder.asset || 'USDT',
      fiat_unit: selectedOrder.fiat || 'INR',
      amount: parseFloat(selectedOrder.amount || '0'),
      total_price: parseFloat(selectedOrder.totalPrice || '0'),
      unit_price: parseFloat(selectedOrder.unitPrice || selectedOrder.price || '0'),
      commission: parseFloat(selectedOrder.commission || '0'),
      order_status: mapOrderStatusCode(selectedOrder.orderStatus),
      pay_method_name: selectedOrder.payMethodName || null,
      binance_create_time: selectedOrder.createTime || null,
      is_repeat_client: false,
      repeat_order_count: 0,
      assigned_operator_id: null,
      order_type: null,
      synced_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
      additional_kyc_verify: selectedOrder.additionalKycVerify ?? 0,
    };

    return (
      <div className="h-[calc(100vh-48px)]">
        <OrderDetailWorkspace
          order={record as any}
          onClose={async () => {
            setSelectedOrder(null);
            await refetch();
          }}
        />
      </div>
    );
  }

  return (
    <TerminalPermissionGate permissions={['terminal_payer_view']}>
      <div className="p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Payer</h1>
              <p className="text-xs text-muted-foreground">BUY Order Payment Execution</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {filteredOrders.length} orders
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="h-9">
              <TabsTrigger value="pending" className="gap-1.5 text-xs h-7">
                <Clock className="h-3.5 w-3.5" />
                Pending
                {orders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{orders.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-1.5 text-xs h-7">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed
                {completedOrders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{completedOrders.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or order ID..."
              className="h-8 pl-8 text-xs bg-secondary border-border"
            />
          </div>
        </div>

        {/* Orders Table */}
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <CreditCard className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'pending' ? 'No orders awaiting payment' : 'No completed orders'}
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Orders matching your assignments will appear here
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-[10px] text-muted-foreground font-medium">Date</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground font-medium">Order No.</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground font-medium">Amount</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground font-medium">Counterparty</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground font-medium">Payment</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground font-medium">Status</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order: any) => (
                      <PayerOrderRow
                        key={order.orderNumber}
                        order={order}
                        isExcluded={exclusions.has(order.orderNumber)}
                        isCompleted={activeTab === 'completed'}
                        onOpenOrder={() => setSelectedOrder(order)}
                        onMarkPaidSuccess={() => refetch()}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TerminalPermissionGate>
  );
}
