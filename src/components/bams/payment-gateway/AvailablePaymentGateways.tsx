import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, DollarSign, Calendar, Plus, Building, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddPaymentGatewayDialog } from "./AddPaymentGatewayDialog";
import { EditPaymentGatewayDialog } from "./EditPaymentGatewayDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";

interface PaymentGateway {
  id: string;
  type: string;
  upi_id?: string;
  risk_category: string;
  payment_limit: number;
  current_usage: number;
  is_active: boolean;
  settlement_cycle: string | null;
  settlement_days: number | null;
  payment_gateway: boolean;
  bank_account_id: string | null;
  bank_accounts?: {
    id: string;
    account_name: string;
    bank_name: string;
  };
}

export function AvailablePaymentGateways() {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('bams_manage');

  useEffect(() => {
    fetchPaymentGateways();
  }, []);

  const fetchPaymentGateways = async () => {
    try {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          id, type, upi_id, risk_category, payment_limit, current_usage, 
          is_active, settlement_cycle, settlement_days, payment_gateway, bank_account_id,
          bank_accounts (
            id,
            account_name,
            bank_name
          )
        `)
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

  const handleEditGateway = (gateway: PaymentGateway) => {
    setSelectedGateway(gateway);
    setEditDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Available Payment Gateways</h3>
        <ViewOnlyWrapper isViewOnly={!canManage}>
          <Button onClick={() => setAddDialogOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Gateway
          </Button>
        </ViewOnlyWrapper>
      </div>

      {gateways.length === 0 ? (
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No payment gateways configured</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            Click "Add Gateway" to configure your first payment gateway
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gateways.map((gateway) => (
            <Card key={gateway.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    {gateway.type === "UPI" && gateway.upi_id ? gateway.upi_id : gateway.type}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={gateway.is_active ? "default" : "secondary"}>
                      {gateway.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditGateway(gateway)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Settlement Bank Account */}
                {gateway.bank_accounts && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Building className="h-4 w-4" />
                      Settlement Account
                    </div>
                    <p className="font-medium">{gateway.bank_accounts.account_name}</p>
                    <p className="text-sm text-muted-foreground">{gateway.bank_accounts.bank_name}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Risk Category</p>
                    <Badge variant="outline" className="mt-1">
                      {gateway.risk_category}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Settlement</p>
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
                    <span className="text-muted-foreground">Payment Limit</span>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      <span className="font-medium">₹{gateway.payment_limit.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current Usage</span>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      <span className="font-medium">₹{gateway.current_usage.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full" 
                      style={{ 
                        width: `${Math.min((gateway.current_usage / gateway.payment_limit) * 100, 100)}%` 
                      }}
                    ></div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    {((gateway.current_usage / gateway.payment_limit) * 100).toFixed(1)}% used
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddPaymentGatewayDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={fetchPaymentGateways}
      />

      <EditPaymentGatewayDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        gateway={selectedGateway}
        onSuccess={fetchPaymentGateways}
      />
    </div>
  );
}
