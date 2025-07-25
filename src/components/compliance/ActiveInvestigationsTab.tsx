import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Eye, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { InvestigationDetailsDialog } from "./InvestigationDetailsDialog";

export function ActiveInvestigationsTab() {
  const [selectedInvestigation, setSelectedInvestigation] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active investigations with proper loading state
  const { data: investigations, isLoading, error, refetch } = useQuery({
    queryKey: ['active_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select(`
          *,
          bank_accounts (
            bank_name,
            account_name,
            account_number
          )
        `)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching investigations:', error);
        throw error;
      }
      return data || [];
    },
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const resolveInvestigationMutation = useMutation({
    mutationFn: async ({ investigation, resolutionNotes }: { investigation: any; resolutionNotes: string }) => {
      // Update the investigation with resolution notes but keep it ACTIVE until banking officer approval
      const { error: investigationError } = await supabase
        .from('account_investigations')
        .update({
          resolution_notes: resolutionNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', investigation.id);
      
      if (investigationError) throw investigationError;

      // Update the bank account status to PENDING_APPROVAL
      const { error: accountError } = await supabase
        .from('bank_accounts')
        .update({
          status: 'PENDING_APPROVAL',
          updated_at: new Date().toISOString()
        })
        .eq('id', investigation.bank_account_id);
      
      if (accountError) throw accountError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['pending_approval_accounts'] });
      toast({
        title: "Investigation Completed",
        description: "Investigation completed and account moved to pending banking officer approval.",
      });
    },
  });

  const handleViewDetails = (investigation: any) => {
    setSelectedInvestigation(investigation);
    setShowDetailsDialog(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'outline';
      default: return 'secondary';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'HIGH': return <AlertTriangle className="h-4 w-4" />;
      case 'MEDIUM': return <Clock className="h-4 w-4" />;
      case 'LOW': return <CheckCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Invalid Date';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Active Account Investigations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading investigations...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Active Account Investigations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-red-600">
              <p>Error loading investigations. Please try again.</p>
              <Button onClick={() => refetch()} className="mt-2">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Active Account Investigations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!investigations || investigations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium mb-2">No Active Investigations</h3>
              <p>All account investigations have been resolved.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {investigations.map((investigation) => (
                <Card key={investigation.id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 mb-1">
                          {investigation.bank_accounts?.bank_name || 'Unknown Bank'}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          {investigation.bank_accounts?.account_name || 'Unknown Account'}
                        </p>
                        <Badge 
                          variant={getPriorityColor(investigation.priority)}
                          className="flex items-center gap-1 w-fit"
                        >
                          {getPriorityIcon(investigation.priority)}
                          {investigation.priority}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div>
                        <span className="text-xs font-medium text-gray-500">Type:</span>
                        <p className="text-sm text-gray-900">{investigation.investigation_type || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500">Reason:</span>
                        <p className="text-sm text-gray-900 line-clamp-2">{investigation.reason || 'No reason provided'}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500">Started:</span>
                        <p className="text-sm text-gray-900">
                          {investigation.created_at ? formatDate(investigation.created_at) : 'Unknown'}
                        </p>
                      </div>
                      {investigation.resolution_notes && (
                        <div>
                          <span className="text-xs font-medium text-gray-500">Status:</span>
                          <Badge variant="secondary" className="ml-1 bg-orange-100 text-orange-800">
                            Pending Banking Officer Approval
                          </Badge>
                        </div>
                      )}
                    </div>

                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleViewDetails(investigation)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Investigation Details Dialog */}
      {selectedInvestigation && (
        <InvestigationDetailsDialog
          investigation={selectedInvestigation}
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
          onResolve={(resolutionNotes) => {
            resolveInvestigationMutation.mutate({
              investigation: selectedInvestigation,
              resolutionNotes
            });
            setShowDetailsDialog(false);
          }}
        />
      )}
    </div>
  );
}