
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Shield, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";

interface MonthlyLimitsPanelProps {
  clientId?: string;
}

export function MonthlyLimitsPanel({ clientId }: MonthlyLimitsPanelProps) {
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

  // Fetch client's orders to calculate first order value and monthly usage
  const { data: orders } = useQuery({
    queryKey: ['client-orders-limits', activeClientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const { data, error } = await supabase
        .from('sales_orders')
        .select('*')
        .or(`client_name.eq.${client.name},client_phone.eq.${client.phone}`)
        .order('order_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId && !!client,
  });

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            Monthly Limits & Cosmos Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Select a client to view limits
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate first order value
  const firstOrder = orders?.[0];
  const firstOrderValue = firstOrder?.total_amount || client.first_order_value || 0;

  // Calculate current month usage
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthOrders = orders?.filter(order => {
    const orderDate = new Date(order.order_date);
    return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
  }) || [];
  
  const currentMonthUsed = currentMonthOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const monthlyLimit = client.monthly_limit || 100000;
  const usedPercentage = monthlyLimit > 0 ? (currentMonthUsed / monthlyLimit) * 100 : 0;
  const remainingLimit = monthlyLimit - currentMonthUsed;

  // Check for cosmos alerts (if usage > 80% or sudden spike)
  const isCosmosTriggered = usedPercentage > 80;
  
  // Get latest order to check for spikes
  const latestOrderAmount = orders?.[orders.length - 1]?.total_amount || 0;
  const averageOrderAmount = orders?.length > 0 
    ? orders.reduce((sum, order) => sum + order.total_amount, 0) / orders.length 
    : 0;
  const isSpikeDetected = latestOrderAmount > (averageOrderAmount * 2.5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-600" />
          Monthly Limits & Cosmos Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">First Order Value</label>
            <p className="text-lg font-semibold text-green-600">₹{firstOrderValue.toLocaleString()}</p>
            {firstOrder && (
              <p className="text-xs text-gray-500">Order #{firstOrder.order_number}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Current Monthly Limit</label>
            <p className="text-lg font-semibold">₹{monthlyLimit.toLocaleString()}</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-600">Monthly Usage</label>
            <span className="text-sm font-medium">{usedPercentage.toFixed(1)}% Used</span>
          </div>
          <Progress value={usedPercentage} className="h-2" />
          <div className="flex justify-between text-sm text-gray-500 mt-1">
            <span>Used: ₹{currentMonthUsed.toLocaleString()}</span>
            <span>Remaining: ₹{remainingLimit.toLocaleString()}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Cosmos Triggered?</label>
            <Badge variant="outline" className={isCosmosTriggered ? "text-red-600 border-red-200 bg-red-50" : "text-green-600 border-green-200 bg-green-50"}>
              {isCosmosTriggered ? "⚠️ Triggered" : "✅ Not Triggered"}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Spike Detected?</label>
            <Badge variant="outline" className={isSpikeDetected ? "text-orange-600 border-orange-200 bg-orange-50" : "text-green-600 border-green-200 bg-green-50"}>
              {isSpikeDetected ? "⚠️ Yes" : "✅ No"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Re-KYC Status</label>
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              {client.kyc_status}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Risk Level</label>
            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">
              {client.default_risk_level || 'MEDIUM'}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline">
            <TrendingUp className="h-4 w-4 mr-1" />
            Request Limit Increase
          </Button>
          <Button size="sm" variant="outline">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Cosmos Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
