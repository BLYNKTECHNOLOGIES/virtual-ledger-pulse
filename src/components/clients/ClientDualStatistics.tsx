import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, ArrowRightLeft, Calendar, ShoppingCart, ShoppingBag } from "lucide-react";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";

interface ClientDualStatisticsProps {
  clientId?: string;
}

export function ClientDualStatistics({ clientId }: ClientDualStatisticsProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [preset, setPreset] = useState<DateRangePreset>("allTime");

  // Fetch client data
  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Fetch buy orders (sales_orders) - exclude cancelled
  const { data: buyOrders } = useQuery({
    queryKey: ['client-buy-orders', clientId, client?.name, client?.phone, dateRange],
    queryFn: async () => {
      if (!clientId || !client) return [];
      
      let query = supabase
        .from('sales_orders')
        .select('*')
        .or(`client_name.eq.${client.name},client_phone.eq.${client.phone}`)
        .neq('status', 'CANCELLED')
        .order('order_date', { ascending: true });
      
      // Apply date filter if range is set
      if (dateRange?.from) {
        query = query.gte('order_date', dateRange.from.toISOString().split('T')[0]);
      }
      if (dateRange?.to) {
        query = query.lte('order_date', dateRange.to.toISOString().split('T')[0]);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId && !!client,
  });

  // Fetch sell orders (purchase_orders) - exclude cancelled
  const { data: sellOrders } = useQuery({
    queryKey: ['client-sell-orders', clientId, client?.name, client?.phone, dateRange],
    queryFn: async () => {
      if (!clientId || !client) return [];
      
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .or(`supplier_name.eq.${client.name},contact_number.eq.${client.phone}`)
        .neq('status', 'CANCELLED')
        .order('order_date', { ascending: true });
      
      // Apply date filter if range is set
      if (dateRange?.from) {
        query = query.gte('order_date', dateRange.from.toISOString().split('T')[0]);
      }
      if (dateRange?.to) {
        query = query.lte('order_date', dateRange.to.toISOString().split('T')[0]);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId && !!client,
  });

  // Calculate buy statistics
  const buyStats = {
    totalOrders: buyOrders?.length || 0,
    totalVolume: buyOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0,
    avgOrderValue: buyOrders && buyOrders.length > 0 
      ? buyOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0) / buyOrders.length 
      : 0,
    firstOrderDate: buyOrders && buyOrders.length > 0 ? buyOrders[0]?.order_date : null,
    lastOrderDate: buyOrders && buyOrders.length > 0 ? buyOrders[buyOrders.length - 1]?.order_date : null,
  };

  // Calculate sell statistics
  const sellStats = {
    totalOrders: sellOrders?.length || 0,
    totalVolume: sellOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0,
    avgOrderValue: sellOrders && sellOrders.length > 0 
      ? sellOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0) / sellOrders.length 
      : 0,
    firstOrderDate: sellOrders && sellOrders.length > 0 ? sellOrders[0]?.order_date : null,
    lastOrderDate: sellOrders && sellOrders.length > 0 ? sellOrders[sellOrders.length - 1]?.order_date : null,
  };

  // Combined statistics
  const totalTradeVolume = buyStats.totalVolume + sellStats.totalVolume;
  const totalOrders = buyStats.totalOrders + sellStats.totalOrders;
  const avgOrderValue = totalOrders > 0 ? totalTradeVolume / totalOrders : 0;
  const completedOrders = (buyOrders?.filter(o => o.status === 'COMPLETED').length || 0) + 
    (sellOrders?.filter(o => o.status === 'COMPLETED').length || 0);
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

  // Determine client type
  const isBuyer = buyStats.totalOrders > 0;
  const isSeller = sellStats.totalOrders > 0;
  const isComposite = isBuyer && isSeller;

  const handlePresetClick = (presetValue: DateRangePreset) => {
    setPreset(presetValue);
    setDateRange(getDateRangeFromPreset(presetValue));
  };

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            Trading Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Select a client to view trading statistics
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            <CardTitle>Trading Statistics</CardTitle>
            {isComposite && (
              <Badge className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                COMPOSITE
              </Badge>
            )}
            {isBuyer && !isSeller && (
              <Badge className="bg-green-100 text-green-800">BUYER</Badge>
            )}
            {isSeller && !isBuyer && (
              <Badge className="bg-orange-100 text-orange-800">SELLER</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              preset={preset}
              onPresetChange={setPreset}
              className="w-auto"
            />
            <Button
              variant={preset === "allTime" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePresetClick("allTime")}
            >
              All Time
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Buy and Sell Statistics Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Buy Statistics */}
          <div className="bg-green-50 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-green-200 pb-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-green-800">Buy Statistics</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-green-700">Total Orders</label>
                <p className="text-2xl font-bold text-green-600">{buyStats.totalOrders}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-green-700">Total Volume</label>
                <p className="text-2xl font-bold text-green-600">₹{buyStats.totalVolume.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-green-700">Avg Order Value</label>
                <p className="text-lg font-semibold text-green-600">₹{buyStats.avgOrderValue.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-green-700">First Order</label>
                <p className="text-sm text-green-600">
                  {buyStats.firstOrderDate 
                    ? new Date(buyStats.firstOrderDate).toLocaleDateString() 
                    : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Sell Statistics */}
          <div className="bg-orange-50 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-orange-200 pb-2">
              <ShoppingBag className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-semibold text-orange-800">Sell Statistics</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-orange-700">Total Orders</label>
                <p className="text-2xl font-bold text-orange-600">{sellStats.totalOrders}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-orange-700">Total Volume</label>
                <p className="text-2xl font-bold text-orange-600">₹{sellStats.totalVolume.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-orange-700">Avg Order Value</label>
                <p className="text-lg font-semibold text-orange-600">₹{sellStats.avgOrderValue.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-orange-700">First Order</label>
                <p className="text-sm text-orange-600">
                  {sellStats.firstOrderDate 
                    ? new Date(sellStats.firstOrderDate).toLocaleDateString() 
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Combined Summary */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-indigo-800 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Combined Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-indigo-700">Total Trade Volume</label>
              <p className="text-2xl font-bold text-indigo-600">₹{totalTradeVolume.toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-indigo-700">Total Orders</label>
              <p className="text-2xl font-bold text-indigo-600">{totalOrders}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-indigo-700">Avg Order Value</label>
              <p className="text-2xl font-bold text-indigo-600">₹{avgOrderValue.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                Across all transactions
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-indigo-700">Client Type</label>
              <Badge className={
                isComposite 
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white' 
                  : isBuyer 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-orange-100 text-orange-800'
              }>
                {isComposite ? 'COMPOSITE' : isBuyer ? 'BUYER' : isSeller ? 'SELLER' : 'NEW'}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
