import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scale, Plus, Calendar, DollarSign, Search, Edit, Eye, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";

export function LegalActionsTab() {
  const [showNewActionDialog, setShowNewActionDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<any>(null);
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
    actual_cost: "",
    notes: "",
    status: "ACTIVE"
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

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
          actual_cost: actionData.actual_cost ? Number(actionData.actual_cost) : 0,
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
        actual_cost: "",
        notes: "",
        status: "ACTIVE"
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

  // Update legal action mutation
  const updateActionMutation = useMutation({
    mutationFn: async (actionData: any) => {
      const { data, error } = await supabase
        .from('legal_actions')
        .update({
          ...actionData,
          estimated_cost: actionData.estimated_cost ? Number(actionData.estimated_cost) : 0,
          actual_cost: actionData.actual_cost ? Number(actionData.actual_cost) : 0,
          date_filed: actionData.date_filed || null,
          next_hearing_date: actionData.next_hearing_date || null
        })
        .eq('id', actionData.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Legal action updated successfully",
      });
      setShowEditDialog(false);
      setSelectedAction(null);
      queryClient.invalidateQueries({ queryKey: ['legal_actions'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update legal action",
        variant: "destructive",
      });
      console.error('Update error:', error);
    },
  });

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    createActionMutation.mutate(newAction);
  };

  const handleUpdateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAction) {
      updateActionMutation.mutate(selectedAction);
    }
  };

  const handleEditAction = (action: any) => {
    setSelectedAction({
      ...action,
      estimated_cost: action.estimated_cost?.toString() || "",
      actual_cost: action.actual_cost?.toString() || "",
      date_filed: action.date_filed || "",
      next_hearing_date: action.next_hearing_date || ""
    });
    setShowEditDialog(true);
  };

  const handleViewDetails = (action: any) => {
    setSelectedAction(action);
    setShowDetailsDialog(true);
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
            <ViewOnlyWrapper isViewOnly={!hasPermission('compliance_manage')}>
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
            </ViewOnlyWrapper>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active">Active Cases</TabsTrigger>
              <TabsTrigger value="closed">Closed Cases</TabsTrigger>
            </TabsList>
            
            <TabsContent value="active" className="space-y-4 mt-6">
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search active legal actions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-8">Loading legal actions...</div>
                ) : (legalActions?.filter(action => ['ACTIVE', 'ON_HOLD'].includes(action.status)).length || 0) === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No active legal actions found.
                  </div>
                ) : (
                  legalActions?.filter(action => ['ACTIVE', 'ON_HOLD'].includes(action.status))
                    .filter(action => 
                      searchTerm === "" || 
                      action.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      action.case_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      action.opposing_party?.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((action) => (
                    <div key={action.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium">{action.title}</h4>
                          <p className="text-sm text-gray-600">{action.action_type}</p>
                          {action.case_number && (
                            <p className="text-sm text-gray-600">Case: {action.case_number}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getPriorityVariant(action.priority)}>
                            {action.priority}
                          </Badge>
                          <Badge variant={getStatusVariant(action.status)}>
                            {action.status}
                          </Badge>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditAction(action)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetails(action)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
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
            </TabsContent>
            
            <TabsContent value="closed" className="space-y-4 mt-6">
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search closed legal actions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-8">Loading legal actions...</div>
                ) : (legalActions?.filter(action => ['RESOLVED', 'DISMISSED'].includes(action.status)).length || 0) === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No closed legal actions found.
                  </div>
                ) : (
                  legalActions?.filter(action => ['RESOLVED', 'DISMISSED'].includes(action.status))
                    .filter(action => 
                      searchTerm === "" || 
                      action.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      action.case_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      action.opposing_party?.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((action) => (
                    <div key={action.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium">{action.title}</h4>
                          <p className="text-sm text-gray-600">{action.action_type}</p>
                          {action.case_number && (
                            <p className="text-sm text-gray-600">Case: {action.case_number}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getPriorityVariant(action.priority)}>
                            {action.priority}
                          </Badge>
                          <Badge variant={getStatusVariant(action.status)}>
                            {action.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(action)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Summary
                          </Button>
                        </div>
                      </div>
                      
                      {action.description && (
                        <p className="text-sm text-gray-700 mb-3">{action.description}</p>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                        <div className="space-y-1">
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
                        </div>
                        <div className="space-y-1">
                          {action.date_filed && (
                            <div>
                              <span className="font-medium">Filed:</span> {new Date(action.date_filed).toLocaleDateString()}
                            </div>
                          )}
                          {action.estimated_cost > 0 && (
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              <span className="font-medium">Est. Cost:</span> ₹{Number(action.estimated_cost).toLocaleString()}
                            </div>
                          )}
                          {action.actual_cost > 0 && (
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              <span className="font-medium">Actual Cost:</span> ₹{Number(action.actual_cost).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {action.notes && (
                        <div className="text-sm text-gray-600 bg-white p-2 rounded border">
                          <span className="font-medium">Case Summary:</span> {action.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Legal Action Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Legal Action</DialogTitle>
          </DialogHeader>
          {selectedAction && (
            <form onSubmit={handleUpdateAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Action Type *</Label>
                  <Select 
                    value={selectedAction.action_type} 
                    onValueChange={(value) => setSelectedAction(prev => ({ ...prev, action_type: value }))}
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
                    value={selectedAction.priority} 
                    onValueChange={(value) => setSelectedAction(prev => ({ ...prev, priority: value }))}
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
                <Label>Status</Label>
                <Select 
                  value={selectedAction.status} 
                  onValueChange={(value) => setSelectedAction(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="DISMISSED">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={selectedAction.title}
                  onChange={(e) => setSelectedAction(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter action title"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={selectedAction.description}
                  onChange={(e) => setSelectedAction(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter action description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Case Number</Label>
                  <Input
                    value={selectedAction.case_number}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, case_number: e.target.value }))}
                    placeholder="Enter case number"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Court Name</Label>
                  <Input
                    value={selectedAction.court_name}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, court_name: e.target.value }))}
                    placeholder="Enter court name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Opposing Party</Label>
                  <Input
                    value={selectedAction.opposing_party}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, opposing_party: e.target.value }))}
                    placeholder="Enter opposing party name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Our Lawyer</Label>
                  <Input
                    value={selectedAction.our_lawyer}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, our_lawyer: e.target.value }))}
                    placeholder="Enter our lawyer name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Filed</Label>
                  <Input
                    type="date"
                    value={selectedAction.date_filed}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, date_filed: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Next Hearing Date</Label>
                  <Input
                    type="date"
                    value={selectedAction.next_hearing_date}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, next_hearing_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Estimated Cost</Label>
                  <Input
                    type="number"
                    value={selectedAction.estimated_cost}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, estimated_cost: e.target.value }))}
                    placeholder="Enter estimated cost"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Actual Cost</Label>
                  <Input
                    type="number"
                    value={selectedAction.actual_cost}
                    onChange={(e) => setSelectedAction(prev => ({ ...prev, actual_cost: e.target.value }))}
                    placeholder="Enter actual cost"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={selectedAction.notes}
                  onChange={(e) => setSelectedAction(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Enter additional notes"
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateActionMutation.isPending}>
                  {updateActionMutation.isPending ? "Updating..." : "Update Action"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              {selectedAction?.status === 'RESOLVED' || selectedAction?.status === 'DISMISSED' ? 'Case Summary' : 'Legal Action Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedAction && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Basic Information</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Title:</span> {selectedAction.title}</div>
                    <div><span className="font-medium">Action Type:</span> {selectedAction.action_type}</div>
                    {selectedAction.case_number && (
                      <div><span className="font-medium">Case Number:</span> {selectedAction.case_number}</div>
                    )}
                    <div className="flex gap-2">
                      <Badge variant={getPriorityVariant(selectedAction.priority)}>
                        {selectedAction.priority} Priority
                      </Badge>
                      <Badge variant={getStatusVariant(selectedAction.status)}>
                        {selectedAction.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Parties & Court</h4>
                  <div className="space-y-2 text-sm">
                    {selectedAction.court_name && (
                      <div><span className="font-medium">Court:</span> {selectedAction.court_name}</div>
                    )}
                    {selectedAction.opposing_party && (
                      <div><span className="font-medium">Opposing Party:</span> {selectedAction.opposing_party}</div>
                    )}
                    {selectedAction.our_lawyer && (
                      <div><span className="font-medium">Our Lawyer:</span> {selectedAction.our_lawyer}</div>
                    )}
                    {selectedAction.opposing_lawyer && (
                      <div><span className="font-medium">Opposing Lawyer:</span> {selectedAction.opposing_lawyer}</div>
                    )}
                  </div>
                </div>
              </div>

              {selectedAction.description && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    {selectedAction.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Important Dates</h4>
                  <div className="space-y-2 text-sm">
                    {selectedAction.date_filed && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">Filed:</span> {new Date(selectedAction.date_filed).toLocaleDateString()}
                      </div>
                    )}
                    {selectedAction.next_hearing_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">Next Hearing:</span> {new Date(selectedAction.next_hearing_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Financial Details</h4>
                  <div className="space-y-2 text-sm">
                    {selectedAction.estimated_cost > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">Estimated Cost:</span> ₹{Number(selectedAction.estimated_cost).toLocaleString()}
                      </div>
                    )}
                    {selectedAction.actual_cost > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">Actual Cost:</span> ₹{Number(selectedAction.actual_cost).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedAction.notes && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    {selectedAction.status === 'RESOLVED' || selectedAction.status === 'DISMISSED' ? 'Case Summary & Notes' : 'Notes'}
                  </h4>
                  <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    {selectedAction.notes}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-400 border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>Created: {new Date(selectedAction.created_at).toLocaleString()}</div>
                  <div>Last Updated: {new Date(selectedAction.updated_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}