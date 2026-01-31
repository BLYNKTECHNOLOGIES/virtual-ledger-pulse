
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";

interface ClientValueScoreProps {
  clientId?: string;
}

export function ClientValueScore({ clientId }: ClientValueScoreProps) {
  const params = useParams();
  const activeClientId = clientId || params.clientId;

  // Fetch client data
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

  // Fetch client's orders to calculate value metrics (both sales AND purchase orders) - exclude cancelled
  const { data: orders } = useQuery({
    queryKey: ['client-orders-value', activeClientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const allOrders: any[] = [];
      
      // Fetch sales orders (buyer activity) - exclude cancelled
      const { data: salesData } = await supabase
        .from('sales_orders')
        .select('id, order_number, order_date, total_amount, status')
        .or(`client_name.ilike.%${client.name}%,client_phone.eq.${client.phone || 'NONE'}`)
        .neq('status', 'CANCELLED')
        .order('order_date', { ascending: false });
      
      if (salesData) {
        allOrders.push(...salesData.map(o => ({ ...o, order_type: 'SALES' })));
      }
      
      // Fetch purchase orders (seller activity) - exclude cancelled
      const { data: purchaseData } = await supabase
        .from('purchase_orders')
        .select('id, order_number, order_date, total_amount, status')
        .or(`supplier_name.ilike.%${client.name}%,contact_number.eq.${client.phone || 'NONE'}`)
        .neq('status', 'CANCELLED')
        .order('order_date', { ascending: false });
      
      if (purchaseData) {
        allOrders.push(...purchaseData.map(o => ({ ...o, order_type: 'PURCHASE' })));
      }
      
      return allOrders;
    },
    enabled: !!activeClientId && !!client,
  });

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            Client Value Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Select a client to view value score
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate monthly purchase value (current month)
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthOrders = orders?.filter(order => {
    const orderDate = new Date(order.order_date);
    return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
  }) || [];
  
  const monthlyPurchaseValue = currentMonthOrders.reduce((sum, order) => sum + order.total_amount, 0);
  
  // Calculate client value (3% of monthly purchase value)
  const clientValue = monthlyPurchaseValue * 0.03;
  
  // Calculate total lifetime value
  const totalLifetimeValue = orders?.reduce((sum, order) => sum + order.total_amount, 0) || 0;

  // Determine client priority based on value
  const getPriorityTag = () => {
    if (totalLifetimeValue >= 1000000) return { label: 'Platinum', color: 'bg-purple-500' };
    if (totalLifetimeValue >= 500000) return { label: 'Gold', color: 'bg-yellow-500' };
    if (totalLifetimeValue >= 200000) return { label: 'Silver', color: 'bg-gray-400' };
    return { label: 'Bronze', color: 'bg-orange-500' };
  };

  const priorityTag = getPriorityTag();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-purple-600" />
          Client Value Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Monthly Purchase Value</label>
          <p className="text-2xl font-bold text-green-600">₹{monthlyPurchaseValue.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{currentMonthOrders.length} orders this month</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Client Value (3%)</label>
          <p className="text-xl font-semibold text-purple-600">₹{clientValue.toLocaleString()}</p>
          <p className="text-sm text-gray-500">Indicates priority level</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Total Lifetime Value</label>
          <p className="text-lg font-semibold text-blue-600">₹{totalLifetimeValue.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{orders?.length || 0} total orders</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Client Priority Tag</label>
          <Badge className={`${priorityTag.color} text-white flex items-center gap-1 w-fit`}>
            <Star className="h-3 w-3" />
            {priorityTag.label}
          </Badge>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Client Value Score</label>
          <p className="text-lg font-semibold text-indigo-600">{client.client_value_score || 0}/100</p>
        </div>
      </CardContent>
    </Card>
  );
}
