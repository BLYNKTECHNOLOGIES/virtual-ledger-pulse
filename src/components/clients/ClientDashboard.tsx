import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, AlertTriangle, CheckCircle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddClientDialog } from "./AddClientDialog";

export function ClientDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddClientDialog, setShowAddClientDialog] = useState(false);
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

  const handleClientClick = (clientId: string) => {
    navigate(`/clients/${clientId}`);
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
              <Button size="sm" onClick={() => setShowAddClientDialog(true)}>
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
                        onClick={() => handleClientClick(client.id)}
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

      {/* Add Client Dialog */}
      <AddClientDialog 
        open={showAddClientDialog} 
        onOpenChange={setShowAddClientDialog}
      />
    </div>
  );
}
