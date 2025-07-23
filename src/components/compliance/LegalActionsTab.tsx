import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Scale, Plus, Calendar, DollarSign, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function LegalActionsTab() {
  const [showNewActionDialog, setShowNewActionDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [newAction, setNewAction] = useState({
    action_type: "",
    title: "",
    description: "",
    case_number: "",
    court_name: "",
    opposing_party: "",
    our_lawyer: "",
    opposing_lawyer: "",
    priority: "MEDIUM",
    date_filed: "",
    next_hearing_date: "",
    estimated_cost: "",
    notes: ""
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch legal actions
  const { data: legalActions, isLoading } = useQuery({
    queryKey: ['legal_actions', searchTerm, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from('legal_actions')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`title.ilike.%${searchTerm}%,case_number.ilike.%${searchTerm}%,opposing_party.ilike.%${searchTerm}%`);
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Create legal action mutation
  const createActionMutation = useMutation({
    mutationFn: async (actionData: typeof newAction) => {
      const { data, error } = await supabase
        .from('legal_actions')
        .insert([{
          ...actionData,
          estimated_cost: actionData.estimated_cost ? Number(actionData.estimated_cost) : 0,
          date_filed: actionData.date_filed || null,
          next_hearing_date: actionData.next_hearing_date || null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Legal action created successfully",
      });
      setNewAction({
        action_type: "",
        title: "",
        description: "",
        case_number: "",
        court_name: "",
        opposing_party: "",
        our_lawyer: "",
        opposing_lawyer: "",
        priority: "MEDIUM",
        date_filed: "",
        next_hearing_date: "",
        estimated_cost: "",
        notes: ""
      });
      setShowNewActionDialog(false);
      queryClient.invalidateQueries({ queryKey: ['legal_actions'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create legal action",
        variant: "destructive",
      });
      console.error('Create error:', error);
    },
  });

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    createActionMutation.mutate(newAction);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "ACTIVE": return "default";
      case "ON_HOLD": return "secondary";
      case "RESOLVED": return "secondary";
      case "DISMISSED": return "destructive";
      default: return "secondary";
    }
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "HIGH": return "destructive";
      case "MEDIUM": return "secondary";
      case "LOW": return "outline";
      default: return "secondary";
    }
  };

  const actionTypes = [
    "Litigation", "Arbitration", "Compliance Issue", "Contract Dispute", 
    "Employment Issue", "Regulatory Action", "Other"
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Legal Actions
            </CardTitle>
            <Dialog open={showNewActionDialog} onOpenChange={setShowNewActionDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Legal Action
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Legal Action</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateAction} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Action Type *</Label>
                      <Select 
                        value={newAction.action_type} 
                        onValueChange={(value) => setNewAction(prev => ({ ...prev, action_type: value }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select action type" />
                        </SelectTrigger>
                        <SelectContent>
                          {actionTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select 
                        value={newAction.priority} 
                        onValueChange={(value) => setNewAction(prev => ({ ...prev, priority: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HIGH">High</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="LOW">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      value={newAction.title}
                      onChange={(e) => setNewAction(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter action title"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newAction.description}
                      onChange={(e) => setNewAction(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter action description"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Case Number</Label>
                      <Input
                        value={newAction.case_number}
                        onChange={(e) => setNewAction(prev => ({ ...prev, case_number: e.target.value }))}
                        placeholder="Enter case number"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Court Name</Label>
                      <Input
                        value={newAction.court_name}
                        onChange={(e) => setNewAction(prev => ({ ...prev, court_name: e.target.value }))}
                        placeholder="Enter court name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Opposing Party</Label>
                      <Input
                        value={newAction.opposing_party}
                        onChange={(e) => setNewAction(prev => ({ ...prev, opposing_party: e.target.value }))}
                        placeholder="Enter opposing party name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Our Lawyer</Label>
                      <Input
                        value={newAction.our_lawyer}
                        onChange={(e) => setNewAction(prev => ({ ...prev, our_lawyer: e.target.value }))}
                        placeholder="Enter our lawyer name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date Filed</Label>
                      <Input
                        type="date"
                        value={newAction.date_filed}
                        onChange={(e) => setNewAction(prev => ({ ...prev, date_filed: e.target.value }))}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Next Hearing Date</Label>
                      <Input
                        type="date"
                        value={newAction.next_hearing_date}
                        onChange={(e) => setNewAction(prev => ({ ...prev, next_hearing_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Estimated Cost</Label>
                    <Input
                      type="number"
                      value={newAction.estimated_cost}
                      onChange={(e) => setNewAction(prev => ({ ...prev, estimated_cost: e.target.value }))}
                      placeholder="Enter estimated cost"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={newAction.notes}
                      onChange={(e) => setNewAction(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Enter additional notes"
                      rows={2}
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowNewActionDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createActionMutation.isPending}>
                      {createActionMutation.isPending ? "Creating..." : "Create Action"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search legal actions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="DISMISSED">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">Loading legal actions...</div>
            ) : (legalActions?.length || 0) === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No legal actions found. Create your first legal action to get started.
              </div>
            ) : (
              legalActions?.map((action) => (
                <div key={action.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium">{action.title}</h4>
                      <p className="text-sm text-gray-600">{action.action_type}</p>
                      {action.case_number && (
                        <p className="text-sm text-gray-600">Case: {action.case_number}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={getPriorityVariant(action.priority)}>
                        {action.priority}
                      </Badge>
                      <Badge variant={getStatusVariant(action.status)}>
                        {action.status}
                      </Badge>
                    </div>
                  </div>
                  
                  {action.description && (
                    <p className="text-sm text-gray-700 mb-3">{action.description}</p>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                    {action.opposing_party && (
                      <div>
                        <span className="font-medium">Opposing Party:</span> {action.opposing_party}
                      </div>
                    )}
                    {action.our_lawyer && (
                      <div>
                        <span className="font-medium">Our Lawyer:</span> {action.our_lawyer}
                      </div>
                    )}
                    {action.court_name && (
                      <div>
                        <span className="font-medium">Court:</span> {action.court_name}
                      </div>
                    )}
                    {action.date_filed && (
                      <div>
                        <span className="font-medium">Filed:</span> {new Date(action.date_filed).toLocaleDateString()}
                      </div>
                    )}
                    {action.next_hearing_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="font-medium">Next Hearing:</span> {new Date(action.next_hearing_date).toLocaleDateString()}
                      </div>
                    )}
                    {action.estimated_cost > 0 && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span className="font-medium">Est. Cost:</span> ₹{Number(action.estimated_cost).toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  {action.notes && (
                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      <span className="font-medium">Notes:</span> {action.notes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}