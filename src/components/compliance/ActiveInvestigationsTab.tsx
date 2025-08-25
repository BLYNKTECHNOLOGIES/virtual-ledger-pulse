import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Clock, AlertTriangle, Filter, X, Eye, CheckCircle2, RotateCcw, History } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InvestigationDetailsDialog } from "./InvestigationDetailsDialog";

const priorityColors = {
  'HIGH': 'bg-red-50/30 text-red-500 border-red-100',
  'MEDIUM': 'bg-orange-50/30 text-orange-500 border-orange-100',
  'LOW': 'bg-emerald-50/30 text-emerald-500 border-emerald-100'
};

const caseTypeLabels = {
  'ACCOUNT_NOT_WORKING': 'Account Not Working',
  'WRONG_PAYMENT_INITIATED': 'Wrong Payment Initiated', 
  'PAYMENT_NOT_CREDITED': 'Payment Not Credited to Beneficiary',
  'SETTLEMENT_NOT_RECEIVED': 'Settlement Not Received',
  'LIEN_RECEIVED': 'Lien Received',
  'BALANCE_DISCREPANCY': 'Balance Discrepancy'
};

export function ActiveInvestigationsTab() {
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>("all");
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>("all");
  const [selectedInvestigation, setSelectedInvestigation] = useState<any>(null);
  const [investigationDialogOpen, setInvestigationDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bank accounts for filter
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch active investigations
  const { data: investigations, refetch: refetchInvestigations } = useQuery({
    queryKey: ['active_investigations', selectedBankFilter, selectedPriorityFilter],
    queryFn: async () => {
      let query = supabase
        .from('bank_cases')
        .select('*, bank_accounts(bank_name, account_name)')
        .eq('investigation_status', 'UNDER_INVESTIGATION')
        .order('investigation_started_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply filters
      if (selectedBankFilter !== "all") {
        filteredData = filteredData.filter(investigation => 
          investigation.bank_accounts?.bank_name === selectedBankFilter
        );
      }
      
      if (selectedPriorityFilter !== "all") {
        filteredData = filteredData.filter(investigation => 
          investigation.priority === selectedPriorityFilter
        );
      }
      
      return filteredData;
    },
  });

  // Complete Investigation Mutation
  const completeInvestigationMutation = useMutation({
    mutationFn: async ({ caseId, resolutionNotes }: { caseId: string; resolutionNotes: string }) => {
      const { error } = await supabase
        .from('bank_cases')
        .update({
          investigation_status: 'COMPLETED',
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes
        })
        .eq('id', caseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Investigation Completed",
        description: "Case has been resolved and investigation completed.",
      });
      refetchInvestigations();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to complete investigation.",
      });
      console.error('Complete investigation error:', error);
    },
  });

  const uniqueBankNames = Array.from(new Set((bankAccounts || []).map(account => account.bank_name).filter(Boolean)));

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-50 text-red-500 border border-red-100';
      case 'MEDIUM':
        return 'bg-orange-50 text-orange-500 border border-orange-100';
      case 'LOW':
        return 'bg-emerald-50 text-emerald-500 border border-emerald-100';
      default:
        return 'bg-gray-50 text-gray-500 border border-gray-100';
    }
  };

  const getDaysSinceStarted = (startedAt: string) => {
    const days = Math.floor((new Date().getTime() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const handleViewDetails = (investigation: any) => {
    setSelectedInvestigation(investigation);
    setInvestigationDialogOpen(true);
  };

  const handleResolveInvestigation = (resolutionNotes: string) => {
    if (selectedInvestigation) {
      completeInvestigationMutation.mutate({ 
        caseId: selectedInvestigation.id, 
        resolutionNotes 
      });
      setInvestigationDialogOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-500" />
            Active Account Investigations
          </CardTitle>
          <div className="flex gap-2">
            {/* Bank Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={selectedBankFilter} onValueChange={setSelectedBankFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by bank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  {uniqueBankNames.map((bankName) => (
                    <SelectItem key={bankName} value={bankName}>
                      {bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBankFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBankFilter("all")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Priority Filter */}
            <div className="flex items-center gap-2">
              <Select value={selectedPriorityFilter} onValueChange={setSelectedPriorityFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="HIGH">High Priority</SelectItem>
                  <SelectItem value="MEDIUM">Medium Priority</SelectItem>
                  <SelectItem value="LOW">Low Priority</SelectItem>
                </SelectContent>
              </Select>
              {selectedPriorityFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPriorityFilter("all")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* High Priority Investigations */}
          {investigations?.filter(inv => inv.priority === 'HIGH').length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-red-400 mb-3">
                <AlertTriangle className="h-5 w-5" />
                High Priority Investigations ({investigations.filter(inv => inv.priority === 'HIGH').length})
              </h3>
              <div className="space-y-3">
                {investigations.filter(inv => inv.priority === 'HIGH').map((investigation) => (
                  <div key={investigation.id} className={`border rounded-lg p-4 ${priorityColors[investigation.priority as keyof typeof priorityColors]}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-lg">{investigation.bank_accounts?.bank_name}</h4>
                          <Badge className={getPriorityBadgeColor(investigation.priority)}>
                            {investigation.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          {investigation.bank_accounts?.account_name}
                        </p>
                        <p className="text-sm font-medium text-blue-600 mb-2">
                          {caseTypeLabels[investigation.case_type as keyof typeof caseTypeLabels] || investigation.case_type}
                        </p>
                        <div className="mb-2">
                          <p className="font-medium text-gray-900">{investigation.title}</p>
                          {investigation.description && (
                            <p className="text-sm text-gray-600 mt-1">{investigation.description}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Type:</span> {investigation.case_type?.replace('_', ' ')}
                          </div>
                          <div>
                            <span className="text-gray-600">Reason:</span> {investigation.bank_reason || investigation.description || 'N/A'}
                          </div>
                          <div>
                            <span className="text-gray-600">Started:</span> {investigation.investigation_started_at ? new Date(investigation.investigation_started_at).toLocaleDateString() : 'N/A'}
                          </div>
                          <div>
                            <span className="text-gray-600">Days Active:</span> {investigation.investigation_started_at ? getDaysSinceStarted(investigation.investigation_started_at) : 0} days
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-red-100 text-red-500 hover:bg-red-50"
                        onClick={() => handleViewDetails(investigation)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Update Status
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-blue-100 text-blue-500 hover:bg-blue-50"
                        onClick={() => completeInvestigationMutation.mutate({ 
                          caseId: investigation.id, 
                          resolutionNotes: "Investigation completed through active investigations tab" 
                        })}
                        disabled={completeInvestigationMutation.isPending}
                      >
                        <History className="h-4 w-4 mr-2" />
                        View Timeline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low Priority Investigations */}
          {investigations?.filter(inv => inv.priority === 'LOW').length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-emerald-400 mb-3">
                <Clock className="h-5 w-5" />
                Low Priority Investigations ({investigations.filter(inv => inv.priority === 'LOW').length})
              </h3>
              <div className="space-y-3">
                {investigations.filter(inv => inv.priority === 'LOW').map((investigation) => (
                  <div key={investigation.id} className={`border rounded-lg p-4 ${priorityColors[investigation.priority as keyof typeof priorityColors]}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-lg">{investigation.bank_accounts?.bank_name}</h4>
                          <Badge className={getPriorityBadgeColor(investigation.priority)}>
                            {investigation.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          {investigation.bank_accounts?.account_name}
                        </p>
                        <p className="text-sm font-medium text-blue-600 mb-2">
                          {caseTypeLabels[investigation.case_type as keyof typeof caseTypeLabels] || investigation.case_type}
                        </p>
                        <div className="mb-2">
                          <p className="font-medium text-gray-900">{investigation.title}</p>
                          {investigation.description && (
                            <p className="text-sm text-gray-600 mt-1">{investigation.description}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Type:</span> {investigation.case_type?.replace('_', ' ')}
                          </div>
                          <div>
                            <span className="text-gray-600">Reason:</span> {investigation.bank_reason || investigation.description || 'N/A'}
                          </div>
                          <div>
                            <span className="text-gray-600">Started:</span> {investigation.investigation_started_at ? new Date(investigation.investigation_started_at).toLocaleDateString() : 'N/A'}
                          </div>
                          <div>
                            <span className="text-gray-600">Days Active:</span> {investigation.investigation_started_at ? getDaysSinceStarted(investigation.investigation_started_at) : 0} days
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-emerald-100 text-emerald-500 hover:bg-emerald-50"
                        onClick={() => handleViewDetails(investigation)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Update Status
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-blue-100 text-blue-500 hover:bg-blue-50"
                        onClick={() => completeInvestigationMutation.mutate({ 
                          caseId: investigation.id, 
                          resolutionNotes: "Investigation completed through active investigations tab" 
                        })}
                        disabled={completeInvestigationMutation.isPending}
                      >
                        <History className="h-4 w-4 mr-2" />
                        View Timeline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medium Priority Investigations */}
          {investigations?.filter(inv => inv.priority === 'MEDIUM').length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-orange-400 mb-3">
                <Clock className="h-5 w-5" />
                Medium Priority Investigations ({investigations.filter(inv => inv.priority === 'MEDIUM').length})
              </h3>
              <div className="space-y-3">
                {investigations.filter(inv => inv.priority === 'MEDIUM').map((investigation) => (
                  <div key={investigation.id} className={`border rounded-lg p-4 ${priorityColors[investigation.priority as keyof typeof priorityColors]}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-lg">{investigation.bank_accounts?.bank_name}</h4>
                          <Badge className={getPriorityBadgeColor(investigation.priority)}>
                            {investigation.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          {investigation.bank_accounts?.account_name}
                        </p>
                        <p className="text-sm font-medium text-blue-600 mb-2">
                          {caseTypeLabels[investigation.case_type as keyof typeof caseTypeLabels] || investigation.case_type}
                        </p>
                        <div className="mb-2">
                          <p className="font-medium text-gray-900">{investigation.title}</p>
                          {investigation.description && (
                            <p className="text-sm text-gray-600 mt-1">{investigation.description}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Type:</span> {investigation.case_type?.replace('_', ' ')}
                          </div>
                          <div>
                            <span className="text-gray-600">Reason:</span> {investigation.bank_reason || investigation.description || 'N/A'}
                          </div>
                          <div>
                            <span className="text-gray-600">Started:</span> {investigation.investigation_started_at ? new Date(investigation.investigation_started_at).toLocaleDateString() : 'N/A'}
                          </div>
                          <div>
                            <span className="text-gray-600">Days Active:</span> {investigation.investigation_started_at ? getDaysSinceStarted(investigation.investigation_started_at) : 0} days
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-orange-100 text-orange-500 hover:bg-orange-50"
                        onClick={() => handleViewDetails(investigation)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Update Status
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-blue-100 text-blue-500 hover:bg-blue-50"
                        onClick={() => completeInvestigationMutation.mutate({ 
                          caseId: investigation.id, 
                          resolutionNotes: "Investigation completed through active investigations tab" 
                        })}
                        disabled={completeInvestigationMutation.isPending}
                      >
                        <History className="h-4 w-4 mr-2" />
                        View Timeline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {(!investigations || investigations.length === 0) && (
            <div className="text-center py-8 text-gray-500">
              No active investigations found.
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Investigation Details Dialog */}
      {selectedInvestigation && (
        <InvestigationDetailsDialog
          investigation={selectedInvestigation}
          open={investigationDialogOpen}
          onOpenChange={setInvestigationDialogOpen}
          onResolve={handleResolveInvestigation}
        />
      )}
    </Card>
  );
}