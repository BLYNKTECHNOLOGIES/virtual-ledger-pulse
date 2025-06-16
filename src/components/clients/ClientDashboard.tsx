
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, AlertTriangle, CheckCircle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function ClientDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);

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

  // Fetch client orders
  const { data: clientOrders } = useQuery({
    queryKey: ['client_orders', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return [];
      
      const { data, error } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('client_name', selectedClient.name)
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClient?.id,
  });

  const filteredClients = clients?.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.client_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      {/* Header with Quick Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Client CRM Dashboard
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Re-KYC Required (5)
              </Button>
              <Button variant="outline" size="sm">
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve New Clients (2)
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add New Client
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search clients by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Client List */}
      <Card>
        <CardHeader>
          <CardTitle>Client Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading clients...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Client Name</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Client ID</th>
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
                  {filteredClients?.map((client) => {
                    const valueScore = getClientValueScore(client);
                    const priority = getClientPriority(valueScore);
                    const cosmosAlert = (client.current_month_used || 0) > (client.monthly_limit || client.first_order_value * 2);
                    
                    return (
                      <tr 
                        key={client.id} 
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedClient(client)}
                      >
                        <td className="py-3 px-4 font-medium">{client.name}</td>
                        <td className="py-3 px-4 font-mono text-sm">{client.client_id}</td>
                        <td className="py-3 px-4">{client.assigned_operator || 'Unassigned'}</td>
                        <td className="py-3 px-4">{getRiskBadge(client.risk_appetite)}</td>
                        <td className="py-3 px-4">0</td> {/* Will be calculated from orders */}
                        <td className="py-3 px-4">-</td> {/* Will be calculated from orders */}
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
              
              {filteredClients?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No clients found. Add your first client to get started.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Detail Modal */}
      {selectedClient && (
        <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Client Profile - {selectedClient.name}</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Client Overview */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Client Overview</h3>
                <div className="space-y-2">
                  <div><strong>Client ID:</strong> {selectedClient.client_id}</div>
                  <div><strong>Date of Onboarding:</strong> {format(new Date(selectedClient.date_of_onboarding), 'MMM dd, yyyy')}</div>
                  <div><strong>Risk Appetite:</strong> {getRiskBadge(selectedClient.risk_appetite)}</div>
                  <div><strong>Client Type:</strong> {selectedClient.client_type}</div>
                  <div><strong>Assigned RM:</strong> {selectedClient.assigned_operator || 'Unassigned'}</div>
                </div>
              </div>

              {/* Monthly Limits */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Monthly Limits & COSMOS</h3>
                <div className="space-y-2">
                  <div><strong>First Order Value:</strong> ₹{selectedClient.first_order_value || 0}</div>
                  <div><strong>Current Monthly Limit:</strong> ₹{selectedClient.monthly_limit || (selectedClient.first_order_value * 2)}</div>
                  <div><strong>Current Month Used:</strong> ₹{selectedClient.current_month_used || 0}</div>
                  <div><strong>Remaining Limit:</strong> ₹{(selectedClient.monthly_limit || (selectedClient.first_order_value * 2)) - (selectedClient.current_month_used || 0)}</div>
                  <div><strong>KYC Status:</strong> {getKYCBadge(selectedClient.kyc_status)}</div>
                </div>
              </div>

              {/* Client Value Score */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Client Value Score</h3>
                <div className="space-y-2">
                  <div><strong>Monthly Purchase Value:</strong> ₹{selectedClient.current_month_used || 0}</div>
                  <div><strong>Client Value (3%):</strong> ₹{getClientValueScore(selectedClient).toFixed(2)}</div>
                  <div><strong>Priority Tag:</strong> {(() => {
                    const priority = getClientPriority(getClientValueScore(selectedClient));
                    return <Badge className={priority.color}>{priority.tag}</Badge>;
                  })()}</div>
                </div>
              </div>

              {/* Purpose & Communication */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Purpose & Communication</h3>
                <div className="space-y-2">
                  <div><strong>Purpose of Buying:</strong> {selectedClient.buying_purpose || 'Not specified'}</div>
                  <div><strong>Phone:</strong> {selectedClient.phone || 'Not provided'}</div>
                  <div><strong>Email:</strong> {selectedClient.email || 'Not provided'}</div>
                </div>
              </div>
            </div>

            {/* Order History */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Order History</h3>
              {clientOrders && clientOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Order ID</th>
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left py-2 px-3">Platform</th>
                        <th className="text-left py-2 px-3">Amount</th>
                        <th className="text-left py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientOrders.map((order) => (
                        <tr key={order.id} className="border-b">
                          <td className="py-2 px-3 font-mono">{order.order_number}</td>
                          <td className="py-2 px-3">{format(new Date(order.order_date), 'MMM dd, yyyy')}</td>
                          <td className="py-2 px-3">{order.platform}</td>
                          <td className="py-2 px-3">₹{order.amount}</td>
                          <td className="py-2 px-3">
                            <Badge variant={order.payment_status === 'COMPLETED' ? 'default' : 'secondary'}>
                              {order.payment_status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No orders found for this client.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
