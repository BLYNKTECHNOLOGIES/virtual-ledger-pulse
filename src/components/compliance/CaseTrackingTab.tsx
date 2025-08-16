import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Filter, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ViewTimelineDialog } from "./ViewTimelineDialog";
import { Search, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const caseTypeLabels = {
  'ACCOUNT_NOT_WORKING': 'Account Not Working',
  'WRONG_PAYMENT_INITIATED': 'Wrong Payment Initiated', 
  'PAYMENT_NOT_CREDITED': 'Payment Not Credited to Beneficiary',
  'SETTLEMENT_NOT_RECEIVED': 'Settlement Not Received',
  'LIEN_RECEIVED': 'Lien Received',
  'BALANCE_DISCREPANCY': 'Balance Discrepancy'
};

export function CaseTrackingTab() {
  const [showNewCaseDialog, setShowNewCaseDialog] = useState(false);
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [selectedCaseTypeFilter, setSelectedCaseTypeFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bank accounts
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

  // Fetch all bank cases
  const { data: bankCases, refetch: refetchCases } = useQuery({
    queryKey: ['bank_cases', selectedBankFilter, selectedStatusFilter, selectedCaseTypeFilter],
    queryFn: async () => {
      let query = supabase
        .from('bank_cases')
        .select('*, bank_accounts(bank_name, account_name)')
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply filters
      if (selectedBankFilter !== "all") {
        filteredData = filteredData.filter(case_ => 
          case_.bank_accounts?.bank_name === selectedBankFilter
        );
      }
      
      if (selectedStatusFilter !== "all") {
        filteredData = filteredData.filter(case_ => case_.status === selectedStatusFilter);
      }
      
      if (selectedCaseTypeFilter !== "all") {
        filteredData = filteredData.filter(case_ => case_.case_type === selectedCaseTypeFilter);
      }
      
      return filteredData;
    },
  });

  // Get unique bank names for filter
  const uniqueBankNames = Array.from(new Set((bankAccounts || []).map(account => account.bank_name).filter(Boolean)));

  // Start Investigation Mutation
  const startInvestigationMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const { error } = await supabase
        .from('bank_cases')
        .update({
          investigation_status: 'UNDER_INVESTIGATION',
          investigation_started_at: new Date().toISOString(),
          investigation_assigned_to: 'Current User' // You can replace with actual user
        })
        .eq('id', caseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Investigation Started",
        description: "Case has been moved to under investigation.",
      });
      refetchCases();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start investigation.",
      });
      console.error('Investigation error:', error);
    },
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CLOSED':
        return 'default';
      case 'OPEN':
      case 'ACTIVE':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CLOSED':
        return 'text-green-800 bg-green-50 border-green-200';
      case 'OPEN':
      case 'ACTIVE':
        return 'text-red-800 bg-red-50 border-red-200';
      default:
        return 'text-gray-800 bg-gray-50 border-gray-200';
    }
  };

  const getCaseTypeIcon = (caseType: string) => {
    switch (caseType) {
      case 'Lien Received':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Case Tracking
          </CardTitle>
          <div className="flex gap-2">
            {/* Case Type Filter */}
            <div className="flex items-center gap-2">
              <Select value={selectedCaseTypeFilter} onValueChange={setSelectedCaseTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by case type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Case Types</SelectItem>
                  {Object.entries(caseTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCaseTypeFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCaseTypeFilter("all")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

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

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
              {selectedStatusFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStatusFilter("all")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Button 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => setShowNewCaseDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Report New Case
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {(bankCases || []).map((bankCase) => (
            <div key={bankCase.id} className={`border rounded-lg p-4 ${getStatusColor(bankCase.status)}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    {getCaseTypeIcon(bankCase.case_type)}
                    <h4 className="font-medium">{bankCase.case_number}</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {bankCase.bank_accounts?.bank_name} - {bankCase.bank_accounts?.account_name}
                  </p>
                  <p className="text-sm font-medium text-blue-600 mt-1">
                    {bankCase.case_type}
                  </p>
                </div>
                <Badge variant={getStatusBadgeVariant(bankCase.status)}>
                  {bankCase.status}
                </Badge>
              </div>
              
              <div className="mb-3">
                <h5 className="font-medium text-gray-900">{bankCase.title}</h5>
                {bankCase.description && (
                  <p className="text-sm text-gray-600 mt-1">{bankCase.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {bankCase.amount_involved && (
                  <div>
                    <span className="text-gray-600">Amount:</span> ₹{Number(bankCase.amount_involved).toLocaleString()}
                  </div>
                )}
                {bankCase.due_date && (
                  <div>
                    <span className="text-gray-600">Due Date:</span> {new Date(bankCase.due_date).toLocaleDateString()}
                  </div>
                )}
                {bankCase.priority && (
                  <div>
                    <span className="text-gray-600">Priority:</span> {bankCase.priority}
                  </div>
                )}
                {bankCase.assigned_to && (
                  <div>
                    <span className="text-gray-600">Assigned to:</span> {bankCase.assigned_to}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 mt-3">
                {bankCase.investigation_status === 'UNDER_INVESTIGATION' ? (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="bg-blue-100 text-blue-800 hover:bg-blue-200"
                    disabled
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Under Investigation
                  </Button>
                ) : (
                  <Button 
                    variant="default" 
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
                    onClick={() => startInvestigationMutation.mutate(bankCase.id)}
                    disabled={startInvestigationMutation.isPending}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    {startInvestigationMutation.isPending ? 'Starting...' : 'Start Investigation'}
                  </Button>
                )}
                <ViewTimelineDialog lienCaseId={bankCase.id} />
              </div>
            </div>
          ))}
          
          {(!bankCases || bankCases.length === 0) && (
            <div className="text-center py-8 text-gray-500">
              No cases found. Report your first case to get started.
            </div>
          )}
        </div>
      </CardContent>

      {/* New Case Dialog - Navigate to BAMS */}
      <Dialog open={showNewCaseDialog} onOpenChange={setShowNewCaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Case</DialogTitle>
          </DialogHeader>
          <div className="text-center py-6">
            <p className="mb-4">To create a new case, please navigate to the BAMS section where you can use the Case Generator.</p>
            <Button onClick={() => setShowNewCaseDialog(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}