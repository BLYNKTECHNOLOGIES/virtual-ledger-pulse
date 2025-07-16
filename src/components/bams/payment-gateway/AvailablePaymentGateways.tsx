import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, DollarSign, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaymentGateway {
  id: string;
  type: string;
  risk_category: string;
  payment_limit: number;
  current_usage: number;
  is_active: boolean;
  settlement_cycle: string | null;
  settlement_days: number | null;
  payment_gateway: boolean;
}

export function AvailablePaymentGateways() {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPaymentGateways();
  }, []);

  const fetchPaymentGateways = async () => {
    try {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*')
        .eq('payment_gateway', true)
        .eq('is_active', true);

      if (error) throw error;
      setGateways(data || []);
    } catch (error) {
      console.error('Error fetching payment gateways:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payment gateways",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSettlementInfo = (gateway: PaymentGateway) => {
    if (!gateway.settlement_cycle) return "Not configured";
    
    if (gateway.settlement_cycle === "Custom" && gateway.settlement_days) {
      return `T+${gateway.settlement_days} Days`;
    }
    return gateway.settlement_cycle;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (gateways.length === 0) {
    return (
      <div className="text-center py-12">
        <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">No payment gateways configured</p>
        <p className="text-sm text-gray-400 mt-2">
          Payment gateways will appear here when configured in Sales Methods
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {gateways.map((gateway) => (
        <Card key={gateway.id} className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {gateway.type}
              </CardTitle>
              <Badge variant={gateway.is_active ? "default" : "secondary"}>
                {gateway.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Risk Category</p>
                <Badge variant="outline" className="mt-1">
                  {gateway.risk_category}
                </Badge>
              </div>
              <div>
                <p className="text-gray-500">Settlement</p>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3" />
                  <span className="text-sm font-medium">
                    {getSettlementInfo(gateway)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Payment Limit</span>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  <span className="font-medium">₹{gateway.payment_limit.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Current Usage</span>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  <span className="font-medium">₹{gateway.current_usage.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ 
                    width: `${Math.min((gateway.current_usage / gateway.payment_limit) * 100, 100)}%` 
                  }}
                ></div>
              </div>
              
              <p className="text-xs text-gray-500 text-center">
                {((gateway.current_usage / gateway.payment_limit) * 100).toFixed(1)}% used
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}