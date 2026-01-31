import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, AlertTriangle, CheckCircle, Users, UserCheck, ShoppingCart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddClientDialog } from "./AddClientDialog";
import { AddBuyerDialog } from "./AddBuyerDialog";
import { ClientOnboardingApprovals } from "./ClientOnboardingApprovals";
import { SellerOnboardingApprovals } from "./SellerOnboardingApprovals";
import { PermissionGate } from "@/components/PermissionGate";
import { useClientTypeFromOrders } from "@/hooks/useClientTypeFromOrders";

export function ClientDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddClientDialog, setShowAddClientDialog] = useState(false);
  const [showAddBuyerDialog, setShowAddBuyerDialog] = useState(false);
  const navigate = useNavigate();

  // Fetch clients
  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Get client types based on actual orders
  const { data: clientOrderCounts } = useClientTypeFromOrders(clients);

  // Filter clients by type based on actual order history
  // Buyer: has sales orders (they buy from us)
  // Seller: has purchase orders (they sell to us)
  // Composite: has both - appears in both directories
  const filteredBuyers = clients?.filter(client => {
    const orderInfo = clientOrderCounts?.get(client.id);
    // Show as buyer if they have sales orders (isBuyer) or are composite
    // Also show clients with no orders yet that were added as buyers (is_buyer flag)
    const isBuyer = orderInfo?.isBuyer || orderInfo?.isComposite || 
                    ((!orderInfo || orderInfo.clientType === 'Unknown') && client.is_buyer);
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          client.client_id.toLowerCase().includes(searchTerm.toLowerCase());
    return isBuyer && matchesSearch;
  });

  const filteredSellers = clients?.filter(client => {
    const orderInfo = clientOrderCounts?.get(client.id);
    // Show as seller if they have purchase orders (isSeller) or are composite
    // Also show clients with no orders yet that were added as sellers (is_seller flag)
    const isSeller = orderInfo?.isSeller || orderInfo?.isComposite ||
                     ((!orderInfo || orderInfo.clientType === 'Unknown') && client.is_seller);
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          client.client_id.toLowerCase().includes(searchTerm.toLowerCase());
    return isSeller && matchesSearch;
  });

  const getRiskBadge = (risk: string) => {
    const colors = {
      'HIGH': 'bg-red-100 text-red-800',
      'MEDIUM': 'bg-yellow-100 text-yellow-800',
      'LOW': 'bg-green-100 text-green-800',
      'NO_RISK': 'bg-blue-100 text-blue-800'
    };
    return <Badge className={colors[risk as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>{risk}</Badge>;
  };

  const getKYCBadge = (status: string) => {
    const colors = {
      'VERIFIED': 'bg-green-100 text-green-800',
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'REJECTED': 'bg-red-100 text-red-800'
    };
    return <Badge className={colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
  };

  const getClientValueScore = (client: any) => {
    const monthlyValue = client.current_month_used || 0;
    const valueScore = monthlyValue * 0.03; // 3% of monthly purchase
    return valueScore;
  };

  const getClientPriority = (valueScore: number) => {
    if (valueScore >= 10000) return { tag: 'Platinum', color: 'bg-purple-100 text-purple-800' };
    if (valueScore >= 5000) return { tag: 'Gold', color: 'bg-yellow-100 text-yellow-800' };
    if (valueScore >= 1000) return { tag: 'Silver', color: 'bg-gray-100 text-gray-800' };
    return { tag: 'General', color: 'bg-blue-100 text-blue-800' };
  };

  const handleClientClick = (clientId: string) => {
    navigate(`/clients/${clientId}`);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="directory" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="directory">Client Directory</TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Buyer Approvals
          </TabsTrigger>
          <TabsTrigger value="seller-approvals" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Seller Approvals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="space-y-6">
          {/* Nested tabs for Buyers and Sellers */}
          <Tabs defaultValue="buyers" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buyers">Buyers</TabsTrigger>
              <TabsTrigger value="sellers">Sellers</TabsTrigger>
            </TabsList>

            <TabsContent value="buyers" className="space-y-6">
              {/* Header with Quick Actions for Buyers */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Buyers Directory
                    </CardTitle>
                    <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setShowAddBuyerDialog(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Buyer
                        </Button>
                      </div>
                    </PermissionGate>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search buyers by name or contact..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Buyers List */}
              <Card>
                <CardHeader>
                  <CardTitle>Existing Buyers</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Buyer Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Buyer ID</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Assigned RM</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Risk Level</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Total Orders</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Last Order</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">COSMOS Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">KYC Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBuyers?.map((client) => {
                        const valueScore = getClientValueScore(client);
                        const priority = getClientPriority(valueScore);
                        const cosmosAlert = (client.current_month_used || 0) > (client.monthly_limit || client.first_order_value * 2);
                        const orderInfo = clientOrderCounts?.get(client.id);
                        const totalOrders = orderInfo?.salesOrderCount || 0;
                        
                        return (
                          <tr 
                            key={client.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleClientClick(client.id)}
                          >
                            <td className="py-3 px-4 font-medium">{client.name}</td>
                            <td className="py-3 px-4 font-mono text-sm">{client.client_id}</td>
                            <td className="py-3 px-4">{client.assigned_operator || 'Unassigned'}</td>
                            <td className="py-3 px-4">{getRiskBadge(client.risk_appetite)}</td>
                            <td className="py-3 px-4">{totalOrders}</td>
                            <td className="py-3 px-4">-</td>
                            <td className="py-3 px-4">
                              {cosmosAlert ? (
                                <Badge variant="destructive">Alert</Badge>
                              ) : (
                                <Badge variant="secondary">Normal</Badge>
                              )}
                            </td>
                            <td className="py-3 px-4">{getKYCBadge(client.kyc_status)}</td>
                            <td className="py-3 px-4">
                              <Badge className={priority.color}>{priority.tag}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {filteredBuyers?.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No buyers found. Add your first buyer to get started.
                    </div>
                  )}
                </div>
            </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sellers" className="space-y-6">
              {/* Header with Quick Actions for Sellers */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Sellers Directory
                    </CardTitle>
                    <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setShowAddClientDialog(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Seller
                        </Button>
                      </div>
                    </PermissionGate>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search sellers by name or contact..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Sellers List */}
              <Card>
                <CardHeader>
                  <CardTitle>Existing Sellers</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Seller Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Seller ID</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Assigned RM</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Risk Level</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Total Orders</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Last Order</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">COSMOS Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">KYC Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSellers?.map((client) => {
                        const valueScore = getClientValueScore(client);
                        const priority = getClientPriority(valueScore);
                        const cosmosAlert = (client.current_month_used || 0) > (client.monthly_limit || client.first_order_value * 2);
                        const orderInfo = clientOrderCounts?.get(client.id);
                        const totalOrders = orderInfo?.purchaseOrderCount || 0;
                        
                        return (
                          <tr 
                            key={client.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleClientClick(client.id)}
                          >
                            <td className="py-3 px-4 font-medium">{client.name}</td>
                            <td className="py-3 px-4 font-mono text-sm">{client.client_id}</td>
                            <td className="py-3 px-4">{client.assigned_operator || 'Unassigned'}</td>
                            <td className="py-3 px-4">{getRiskBadge(client.risk_appetite)}</td>
                            <td className="py-3 px-4">{totalOrders}</td>
                            <td className="py-3 px-4">-</td>
                            <td className="py-3 px-4">
                              {cosmosAlert ? (
                                <Badge variant="destructive">Alert</Badge>
                              ) : (
                                <Badge variant="secondary">Normal</Badge>
                              )}
                            </td>
                            <td className="py-3 px-4">{getKYCBadge(client.kyc_status)}</td>
                            <td className="py-3 px-4">
                              <Badge className={priority.color}>{priority.tag}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {filteredSellers?.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No sellers found. Add your first seller to get started.
                    </div>
                  )}
                </div>
            </CardContent>
          </Card>
            </TabsContent>

          </Tabs>
        </TabsContent>

        <TabsContent value="approvals">
          <ClientOnboardingApprovals />
        </TabsContent>

        <TabsContent value="seller-approvals">
          <SellerOnboardingApprovals />
        </TabsContent>
      </Tabs>

      {/* Add Client Dialog */}
      <AddClientDialog 
        open={showAddClientDialog} 
        onOpenChange={setShowAddClientDialog}
      />
      
      {/* Add Buyer Dialog */}
      <AddBuyerDialog 
        open={showAddBuyerDialog} 
        onOpenChange={setShowAddBuyerDialog}
      />
    </div>
  );
}
