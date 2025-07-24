
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Edit, Trash2, Phone, Mail, UserPlus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddLeadDialog } from "@/components/leads/AddLeadDialog";

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<any>(null);
  const [leadToEdit, setLeadToEdit] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    contact_number: "",
    estimated_order_value: "",
    source: "",
    description: "",
    status: ""
  });
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

  // Update lead mutation
  const updateMutation = useMutation({
    mutationFn: async ({ leadId, data }: { leadId: string; data: any }) => {
      const { error } = await supabase
        .from('leads')
        .update(data)
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Lead updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update lead",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (lead: any) => {
    setLeadToEdit(lead);
    setEditFormData({
      name: lead.name || "",
      contact_number: lead.contact_number || "",
      estimated_order_value: lead.estimated_order_value?.toString() || "",
      source: lead.source || "",
      description: lead.description || "",
      status: lead.status || "NEW"
    });
    setShowEditDialog(true);
  };

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (leadToEdit) {
      await updateMutation.mutateAsync({
        leadId: leadToEdit.id,
        data: {
          ...editFormData,
          estimated_order_value: editFormData.estimated_order_value ? Number(editFormData.estimated_order_value) : 0
        }
      });
      setShowEditDialog(false);
      setLeadToEdit(null);
    }
  };

  const handleDelete = (lead: any) => {
    setLeadToDelete(lead);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (leadToDelete) {
      deleteMutation.mutate(leadToDelete.id);
      setShowDeleteDialog(false);
      setLeadToDelete(null);
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
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-xl shadow-sm">
                  <UserPlus className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Lead Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Track and manage potential customer leads
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-2"
                      onClick={() => handleEdit(lead)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-2 text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(lead)}
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

      {/* Edit Lead Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>
              Update the lead information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateLead} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter lead name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-contact">Contact Number</Label>
              <Input
                id="edit-contact"
                value={editFormData.contact_number}
                onChange={(e) => setEditFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                placeholder="Enter contact number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-value">Estimated Order Value</Label>
              <Input
                id="edit-value"
                type="number"
                value={editFormData.estimated_order_value}
                onChange={(e) => setEditFormData(prev => ({ ...prev, estimated_order_value: e.target.value }))}
                placeholder="Enter estimated value"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-source">Source</Label>
              <Input
                id="edit-source"
                value={editFormData.source}
                onChange={(e) => setEditFormData(prev => ({ ...prev, source: e.target.value }))}
                placeholder="Enter lead source"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={editFormData.status}
                onChange={(e) => setEditFormData(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="CONVERTED">Converted</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter lead description"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowEditDialog(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Updating..." : "Update Lead"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the lead "{leadToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
