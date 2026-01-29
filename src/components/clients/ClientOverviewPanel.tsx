
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, Tag, Phone, Mail, MapPin, FileText, IndianRupee, CreditCard, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";
import { EditClientDetailsDialog } from "./EditClientDetailsDialog";
import { ViewFullProfileDialog } from "./ViewFullProfileDialog";
import { RequestLimitIncreaseDialog } from "./RequestLimitIncreaseDialog";
import { CosmosSettingsDialog } from "./CosmosSettingsDialog";
import { KYCDocumentsDialog } from "./KYCDocumentsDialog";
import { PermissionGate } from "@/components/PermissionGate";

interface ClientOverviewPanelProps {
  clientId?: string;
  isSeller?: boolean;
  isComposite?: boolean;
}

export function ClientOverviewPanel({ clientId, isSeller, isComposite }: ClientOverviewPanelProps) {
  const params = useParams();
  const activeClientId = clientId || params.clientId;

  // Dialog states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [showCosmosDialog, setShowCosmosDialog] = useState(false);
  const [showKYCDialog, setShowKYCDialog] = useState(false);

  // Fetch client data
  const { data: client, isLoading } = useQuery({
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

  // Fetch client's orders to calculate first order value and stats
  const { data: orders } = useQuery({
    queryKey: ['client-orders', activeClientId],
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

  // Fetch KYC data for additional information (Aadhar, address)
  const { data: kycData } = useQuery({
    queryKey: ['client-kyc', activeClientId],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('counterparty_name', client.name)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId && !!client,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Loading client details...</div>
        </CardContent>
      </Card>
    );
  }

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Client Overview Panel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Select a client to view details
          </div>
        </CardContent>
      </Card>
    );
  }

  const clientAge = client.date_of_onboarding 
    ? Math.floor((new Date().getTime() - new Date(client.date_of_onboarding).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0;

  // Calculate first order value from actual orders
  const firstOrder = orders?.[0];
  const firstOrderValue = firstOrder?.total_amount || client.first_order_value || 0;
  
  // Get latest KYC info for additional details
  const latestKyc = kycData?.[0];

  // Calculate order statistics
  const totalOrders = orders?.length || 0;
  const totalTradeVolume = orders?.reduce((sum, order) => sum + order.total_amount, 0) || 0;
  const completedOrders = orders?.filter(order => order.status === 'COMPLETED').length || 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Client Overview Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Client Name</label>
            <p className="text-lg font-semibold">{client.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client ID</label>
            <p className="text-lg font-semibold text-blue-600">{client.client_id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Phone Number</label>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium">{client.phone || 'Not provided'}</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Email</label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{client.email || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Display Aadhar and Address from KYC if available */}
        {latestKyc && (
          <div className="grid grid-cols-1 gap-4 p-3 bg-blue-50 rounded-md">
            <div>
              <label className="text-sm font-medium text-gray-600">KYC Information</label>
              <div className="flex items-center gap-2 mt-1">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Aadhar documents submitted</span>
              </div>
              {latestKyc.additional_info && (
                <p className="text-sm text-gray-600 mt-1">{latestKyc.additional_info}</p>
              )}
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Date of Onboarding</label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{new Date(client.date_of_onboarding).toLocaleDateString()}</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client Age</label>
            <p className="text-sm text-green-600 font-medium">{clientAge} months</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">First Order Value</label>
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-gray-400" />
              <span className="text-lg font-semibold text-green-600">₹{firstOrderValue.toLocaleString()}</span>
            </div>
            {firstOrder && (
              <p className="text-xs text-gray-500">Order #{firstOrder.order_number} on {new Date(firstOrder.order_date).toLocaleDateString()}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Total Orders</label>
            <p className="text-lg font-semibold text-blue-600">{totalOrders}</p>
            <p className="text-xs text-gray-500">{completedOrders} completed</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Risk Appetite</label>
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
              {client.risk_appetite}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Client Type</label>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                {client.client_type}
              </Badge>
              {isComposite && (
                <Badge className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                  COMPOSITE
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Only show monthly limits for buyers (not sellers) */}
        {!isSeller && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Monthly Limit</label>
              <p className="text-sm font-medium">₹{client.monthly_limit?.toLocaleString() || 'Not set'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Current Month Used</label>
              <p className="text-sm font-medium">₹{client.current_month_used?.toLocaleString() || '0'}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Total Trade Volume</label>
            <p className="text-lg font-semibold text-purple-600">₹{totalTradeVolume.toLocaleString()}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">KYC Status</label>
            <Badge variant={client.kyc_status === 'COMPLETED' ? 'default' : 'secondary'}>
              {client.kyc_status}
            </Badge>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Assigned Operator</label>
          <p className="text-sm font-medium">{client.assigned_operator || 'Unassigned'}</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 pt-4 border-t">
          <div className="grid grid-cols-2 gap-2">
            <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full"
                onClick={() => setShowEditDialog(true)}
              >
                <Tag className="h-4 w-4 mr-1" />
                Edit Details
              </Button>
            </PermissionGate>
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full"
              onClick={() => setShowProfileDialog(true)}
            >
              <User className="h-4 w-4 mr-1" />
              View Full Profile
            </Button>
          </div>
          
          {/* Only show limit and cosmos buttons for buyers */}
          {!isSeller && (
            <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowLimitDialog(true)}
                >
                  <IndianRupee className="h-4 w-4 mr-1" />
                  Request Limit Increase
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowCosmosDialog(true)}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Cosmos Settings
                </Button>
              </div>
            </PermissionGate>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full"
              onClick={() => setShowKYCDialog(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              View KYC & Bank Account Info
            </Button>
          </div>
        </div>
      </CardContent>

      {/* All Dialogs */}
      <EditClientDetailsDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        client={client}
      />

      <ViewFullProfileDialog
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        client={client}
        orders={orders}
        kycData={kycData}
      />

      <RequestLimitIncreaseDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        client={client}
      />

      <CosmosSettingsDialog
        open={showCosmosDialog}
        onOpenChange={setShowCosmosDialog}
        client={client}
      />

      <KYCDocumentsDialog
        open={showKYCDialog}
        onOpenChange={setShowKYCDialog}
        client={client}
      />
    </Card>
  );
}
