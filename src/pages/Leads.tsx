
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Edit, Trash2, Phone, Mail } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddLeadDialog } from "@/components/leads/AddLeadDialog";

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leads, refetch } = useQuery({
    queryKey: ['leads', timeFilter],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Apply time filters
      const now = new Date();
      if (timeFilter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('created_at', today.toISOString());
      } else if (timeFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', weekAgo.toISOString());
      } else if (timeFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', monthAgo.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Delete lead mutation
  const deleteMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Lead deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete lead",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (leadId: string, leadName: string) => {
    if (confirm(`Are you sure you want to delete the lead "${leadName}"?`)) {
      deleteMutation.mutate(leadId);
    }
  };

  const filteredLeads = leads?.filter(lead =>
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lead.contact_number && lead.contact_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (lead.description && lead.description.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "NEW":
        return <Badge className="bg-green-100 text-green-800">New</Badge>;
      case "CONTACTED":
        return <Badge className="bg-blue-100 text-blue-800">Contacted</Badge>;
      case "QUALIFIED":
        return <Badge className="bg-yellow-100 text-yellow-800">Qualified</Badge>;
      case "CONVERTED":
        return <Badge className="bg-purple-100 text-purple-800">Converted</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Leads Management</CardTitle>
            <div className="flex gap-2">
              <Button 
                variant={timeFilter === 'today' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setTimeFilter('today')}
              >
                Today
              </Button>
              <Button 
                variant={timeFilter === 'week' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setTimeFilter('week')}
              >
                This Week
              </Button>
              <Button 
                variant={timeFilter === 'month' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setTimeFilter('month')}
              >
                This Month
              </Button>
              <Button 
                variant={timeFilter === 'all' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setTimeFilter('all')}
              >
                All
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                🔄 Refresh
              </Button>
              <AddLeadDialog />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLeads.map((lead) => (
          <Card key={lead.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                  {getStatusBadge(lead.status)}
                </div>
                
                <div className="space-y-1">
                  {lead.contact_number && (
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {lead.contact_number}
                    </p>
                  )}
                  <p className="text-sm font-medium text-green-600">
                    Est. Value: ₹{lead.estimated_order_value?.toLocaleString() || '0'}
                  </p>
                  {lead.source && (
                    <p className="text-xs text-gray-500">Source: {lead.source}</p>
                  )}
                  {lead.description && (
                    <p className="text-xs text-gray-600">{lead.description}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Created: {new Date(lead.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8 px-2">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-2 text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(lead.id, lead.name)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLeads.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-500">
              No leads found matching your search criteria.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
