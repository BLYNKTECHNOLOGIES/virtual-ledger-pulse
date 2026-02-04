import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Users, UserCheck, ShoppingCart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddClientDialog } from "./AddClientDialog";
import { AddBuyerDialog } from "./AddBuyerDialog";
import { ClientOnboardingApprovals } from "./ClientOnboardingApprovals";
import { SellerOnboardingApprovals } from "./SellerOnboardingApprovals";
import { PermissionGate } from "@/components/PermissionGate";
import { useClientTypeFromOrders, getClientActivityStatus, ClientOrderData, VolumeTrend } from "@/hooks/useClientTypeFromOrders";
import { ClientDirectoryFilters, ClientFilters, defaultFilters } from "./ClientDirectoryFilters";
import { VolumeTrendBadge } from "./VolumeTrendBadge";
import { format, differenceInDays } from "date-fns";

export function ClientDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddClientDialog, setShowAddClientDialog] = useState(false);
  const [showAddBuyerDialog, setShowAddBuyerDialog] = useState(false);
  const [buyerFilters, setBuyerFilters] = useState<ClientFilters>(defaultFilters);
  const [sellerFilters, setSellerFilters] = useState<ClientFilters>(defaultFilters);
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

  // Get unique assigned RMs for filter dropdown
  const availableRMs = useMemo(() => {
    if (!clients) return ['Unassigned'];
    const rms = new Set<string>();
    clients.forEach(c => {
      rms.add(c.assigned_operator || 'Unassigned');
    });
    return Array.from(rms).sort();
  }, [clients]);

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

  // Get volume trend and change based on period and client type
  const getVolumeTrendInfo = (
    orderInfo: ClientOrderData | undefined, 
    isBuyerDirectory: boolean, 
    period: '10-day' | 'month'
  ): { trend: VolumeTrend; changePercent: number | null } => {
    if (!orderInfo) {
      return { trend: 'new', changePercent: null };
    }
    
    if (isBuyerDirectory) {
      if (period === '10-day') {
        return { trend: orderInfo.salesVolumeTrend10Day, changePercent: orderInfo.salesVolumeChange10Day };
      } else {
        return { trend: orderInfo.salesVolumeTrendMonth, changePercent: orderInfo.salesVolumeChangeMonth };
      }
    } else {
      if (period === '10-day') {
        return { trend: orderInfo.purchaseVolumeTrend10Day, changePercent: orderInfo.purchaseVolumeChange10Day };
      } else {
        return { trend: orderInfo.purchaseVolumeTrendMonth, changePercent: orderInfo.purchaseVolumeChangeMonth };
      }
    }
  };

  // Calculate days since onboarding
  const getDaysSinceOnboarding = (client: any): number => {
    if (!client.date_of_onboarding) return 0;
    try {
      return differenceInDays(new Date(), new Date(client.date_of_onboarding));
    } catch {
      return 0;
    }
  };

  // Apply filters to a client
  const applyFilters = (
    client: any, 
    orderInfo: ClientOrderData | undefined, 
    filters: ClientFilters,
    isBuyerDirectory: boolean
  ): boolean => {
    // Basic filters
    if (filters.riskLevels.length > 0 && !filters.riskLevels.includes(client.risk_appetite)) {
      return false;
    }

    if (filters.kycStatuses.length > 0 && !filters.kycStatuses.includes(client.kyc_status)) {
      return false;
    }

    // Priority filter (calculated)
    const valueScore = getClientValueScore(client);
    const priority = getClientPriority(valueScore);
    if (filters.priorities.length > 0 && !filters.priorities.includes(priority.tag)) {
      return false;
    }

    // COSMOS Status filter
    const cosmosAlert = (client.current_month_used || 0) > (client.monthly_limit || client.first_order_value * 2);
    if (filters.cosmosStatus === 'alert' && !cosmosAlert) return false;
    if (filters.cosmosStatus === 'normal' && cosmosAlert) return false;

    // State filter
    if (filters.states.length > 0 && !filters.states.includes(client.state || '')) {
      return false;
    }

    // Assigned RM filter
    if (filters.assignedRMs.length > 0) {
      const rm = client.assigned_operator || 'Unassigned';
      if (!filters.assignedRMs.includes(rm)) return false;
    }

    // Amount range filters - use appropriate values based on directory type
    const totalValue = isBuyerDirectory 
      ? (orderInfo?.totalSalesValue || 0)
      : (orderInfo?.totalPurchaseValue || 0);
    
    if (filters.totalValueMin && totalValue < parseFloat(filters.totalValueMin)) return false;
    if (filters.totalValueMax && totalValue > parseFloat(filters.totalValueMax)) return false;

    const avgOrder = isBuyerDirectory
      ? (orderInfo?.averageSalesOrderValue || 0)
      : (orderInfo?.averagePurchaseOrderValue || 0);
    
    if (filters.avgOrderMin && avgOrder < parseFloat(filters.avgOrderMin)) return false;
    if (filters.avgOrderMax && avgOrder > parseFloat(filters.avgOrderMax)) return false;

    // Monthly usage % filter
    const monthlyLimit = client.monthly_limit || client.first_order_value * 2 || 1;
    const usagePercent = ((client.current_month_used || 0) / monthlyLimit) * 100;
    if (filters.monthlyUsageMin && usagePercent < parseFloat(filters.monthlyUsageMin)) return false;
    if (filters.monthlyUsageMax && usagePercent > parseFloat(filters.monthlyUsageMax)) return false;

    // Total orders filter
    const totalOrders = isBuyerDirectory
      ? (orderInfo?.salesOrderCount || 0)
      : (orderInfo?.purchaseOrderCount || 0);
    
    if (filters.totalOrdersMin && totalOrders < parseInt(filters.totalOrdersMin)) return false;
    if (filters.totalOrdersMax && totalOrders > parseInt(filters.totalOrdersMax)) return false;

    // Days since last order filter
    const daysSinceLastOrder = isBuyerDirectory
      ? orderInfo?.daysSinceLastSalesOrder
      : orderInfo?.daysSinceLastPurchaseOrder;

    if (filters.daysSinceLastOrderMin && daysSinceLastOrder !== null && daysSinceLastOrder !== undefined) {
      if (daysSinceLastOrder < parseInt(filters.daysSinceLastOrderMin)) return false;
    }
    if (filters.daysSinceLastOrderMax && daysSinceLastOrder !== null && daysSinceLastOrder !== undefined) {
      if (daysSinceLastOrder > parseInt(filters.daysSinceLastOrderMax)) return false;
    }

    // Client status filter (15-day threshold for high-frequency business)
    if (filters.clientStatus.length > 0) {
      const status = getClientActivityStatus(daysSinceLastOrder ?? null, totalOrders);
      if (!filters.clientStatus.includes(status)) return false;
    }

    // Volume trend filter
    if (filters.volumeTrends.length > 0) {
      const { trend } = getVolumeTrendInfo(orderInfo, isBuyerDirectory, filters.volumePeriod);
      if (!filters.volumeTrends.includes(trend)) return false;
    }

    // Volume change % filter
    if (filters.volumeChangeMin || filters.volumeChangeMax) {
      const { changePercent } = getVolumeTrendInfo(orderInfo, isBuyerDirectory, filters.volumePeriod);
      if (changePercent === null) {
        // If no change percent (new client), only include if they're filtering for new
        if (!filters.volumeTrends.includes('new')) return false;
      } else {
        if (filters.volumeChangeMin && changePercent < parseFloat(filters.volumeChangeMin)) return false;
        if (filters.volumeChangeMax && changePercent > parseFloat(filters.volumeChangeMax)) return false;
      }
    }

    // Client age (days since onboarding) filter
    const daysSinceOnboarding = getDaysSinceOnboarding(client);
    if (filters.clientAgeMin && daysSinceOnboarding < parseInt(filters.clientAgeMin)) return false;
    if (filters.clientAgeMax && daysSinceOnboarding > parseInt(filters.clientAgeMax)) return false;

    return true;
  };

  // Filter clients by type based on actual order history
  const filteredBuyers = useMemo(() => {
    return clients?.filter(client => {
      const orderInfo = clientOrderCounts?.get(client.id);
      // Show as buyer if they have sales orders (isBuyer) or are composite
      // Also show clients with no orders yet that were added as buyers (is_buyer flag)
      const isBuyer = orderInfo?.isBuyer || orderInfo?.isComposite || 
                      ((!orderInfo || orderInfo.clientType === 'Unknown') && client.is_buyer);
      
      if (!isBuyer) return false;

      // Search filter
      const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            client.client_id.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // Apply advanced filters
      return applyFilters(client, orderInfo, buyerFilters, true);
    });
  }, [clients, clientOrderCounts, searchTerm, buyerFilters]);

  const filteredSellers = useMemo(() => {
    return clients?.filter(client => {
      const orderInfo = clientOrderCounts?.get(client.id);
      // Show as seller if they have purchase orders (isSeller) or are composite
      // Also show clients with no orders yet that were added as sellers (is_seller flag)
      const isSeller = orderInfo?.isSeller || orderInfo?.isComposite ||
                       ((!orderInfo || orderInfo.clientType === 'Unknown') && client.is_seller);
      
      if (!isSeller) return false;

      // Search filter
      const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            client.client_id.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // Apply advanced filters
      return applyFilters(client, orderInfo, sellerFilters, false);
    });
  }, [clients, clientOrderCounts, searchTerm, sellerFilters]);

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

  const getActivityStatusBadge = (daysSinceLastOrder: number | null | undefined, totalOrders: number) => {
    const status = getClientActivityStatus(daysSinceLastOrder ?? null, totalOrders);
    const statusConfig = {
      'active': { label: 'Active', color: 'bg-green-100 text-green-800' },
      'inactive': { label: 'Inactive', color: 'bg-yellow-100 text-yellow-800' },
      'dormant': { label: 'Dormant', color: 'bg-red-100 text-red-800' },
      'new': { label: 'New', color: 'bg-blue-100 text-blue-800' },
    };
    const config = statusConfig[status];
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const formatLastOrderDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy');
    } catch {
      return '-';
    }
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
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2 flex-1 max-w-sm">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search buyers by name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <ClientDirectoryFilters
                      filters={buyerFilters}
                      onFiltersChange={setBuyerFilters}
                      availableRMs={availableRMs}
                      clientType="buyers"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Buyers List */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Existing Buyers</CardTitle>
                    <Badge variant="outline">{filteredBuyers?.length || 0} results</Badge>
                  </div>
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
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Trend</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">COSMOS</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">KYC</th>
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
                        const { trend, changePercent } = getVolumeTrendInfo(orderInfo, true, buyerFilters.volumePeriod);
                        
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
                            <td className="py-3 px-4">{formatLastOrderDate(orderInfo?.lastSalesOrderDate)}</td>
                            <td className="py-3 px-4">
                              <VolumeTrendBadge trend={trend} changePercent={changePercent} />
                            </td>
                            <td className="py-3 px-4">
                              {getActivityStatusBadge(orderInfo?.daysSinceLastSalesOrder, totalOrders)}
                            </td>
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
                      No buyers found matching your filters.
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
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2 flex-1 max-w-sm">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search sellers by name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <ClientDirectoryFilters
                      filters={sellerFilters}
                      onFiltersChange={setSellerFilters}
                      availableRMs={availableRMs}
                      clientType="sellers"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Sellers List */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Existing Sellers</CardTitle>
                    <Badge variant="outline">{filteredSellers?.length || 0} results</Badge>
                  </div>
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
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Trend</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">COSMOS</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">KYC</th>
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
                        const { trend, changePercent } = getVolumeTrendInfo(orderInfo, false, sellerFilters.volumePeriod);
                        
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
                            <td className="py-3 px-4">{formatLastOrderDate(orderInfo?.lastPurchaseOrderDate)}</td>
                            <td className="py-3 px-4">
                              <VolumeTrendBadge trend={trend} changePercent={changePercent} />
                            </td>
                            <td className="py-3 px-4">
                              {getActivityStatusBadge(orderInfo?.daysSinceLastPurchaseOrder, totalOrders)}
                            </td>
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
                      No sellers found matching your filters.
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
