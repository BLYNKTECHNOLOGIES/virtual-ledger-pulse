import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { syncSmallSales } from '@/hooks/useSmallSalesSync';
import { SmallSalesApprovalDialog } from './SmallSalesApprovalDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function SmallSalesSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch sync records
  const { data: syncRecords, isLoading } = useQuery({
    queryKey: ['small_sales_sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_sync')
        .select('*')
        .order('synced_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch last sync log
  const { data: lastSync } = useQuery({
    queryKey: ['small_sales_last_sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('small_sales_sync_log')
        .select('*')
        .order('sync_started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch order map for expanded rows
  const { data: orderMaps } = useQuery({
    queryKey: ['small_sales_order_map', expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_order_map')
        .select('*')
        .eq('small_sales_sync_id', expandedId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncSmallSales();
      toast({
        title: 'Small Sales Sync Complete',
        description: `${result.synced} entries created, ${result.duplicates} duplicates skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      queryClient.invalidateQueries({ queryKey: ['small_sales_last_sync'] });
    } catch (err: any) {
      toast({ title: 'Sync Error', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return <Badge className="bg-amber-100 text-amber-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">Small Sales Sync</h3>
            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Last sync: {format(new Date(lastSync.sync_started_at), 'dd MMM yyyy HH:mm')} •{' '}
                {lastSync.total_orders_processed} orders → {lastSync.entries_created} entries
              </p>
            )}
          </div>
        </div>
        <Button onClick={handleSync} disabled={syncing} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Small Sales'}
        </Button>
      </div>

      {/* Records Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : !syncRecords || syncRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No small sales sync records yet</p>
            <p className="text-xs mt-1">Click "Sync Small Sales" to fetch and club eligible orders</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {syncRecords.map((record) => (
            <Card key={record.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <span className="text-sm font-bold text-primary">{record.asset_code}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {Number(record.total_quantity).toFixed(4)} {record.asset_code}
                        </span>
                        {getStatusBadge(record.sync_status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {record.order_count} orders • ₹{Number(record.total_amount).toLocaleString()} •
                        Avg ₹{Number(record.avg_price).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {record.time_window_start && format(new Date(record.time_window_start), 'dd MMM HH:mm')} –{' '}
                        {record.time_window_end && format(new Date(record.time_window_end), 'HH:mm')}
                        {' • '}{record.wallet_name || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.sync_status === 'pending_approval' && (
                      <Button size="sm" onClick={() => setSelectedRecord(record)}>
                        Approve
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    >
                      {expandedId === record.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {expandedId === record.id && (
                  <div className="border-t px-4 py-3 bg-muted/30">
                    <p className="text-xs font-medium mb-2">Included Orders ({record.order_numbers?.length || 0})</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {orderMaps?.map((m) => {
                        const od = m.order_data as any;
                        return (
                          <div key={m.id} className="flex items-center justify-between text-xs p-2 bg-background rounded">
                            <span className="font-mono">{m.binance_order_number}</span>
                            <span>{od?.amount} {od?.asset}</span>
                            <span>₹{Number(od?.total_price || 0).toLocaleString()}</span>
                          </div>
                        );
                      })}
                      {(!orderMaps || orderMaps.length === 0) && (
                        <p className="text-xs text-muted-foreground">Loading order details...</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approval Dialog */}
      <SmallSalesApprovalDialog
        open={!!selectedRecord}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
        record={selectedRecord}
      />
    </div>
  );
}
