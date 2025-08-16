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

  // Function to get priority-specific card styling
  const getPriorityCardStyle = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'border-red-300 bg-red-50 shadow-md ring-1 ring-red-200';
      case 'MEDIUM':
        return 'border-orange-300 bg-orange-50 shadow-md ring-1 ring-orange-200';
      case 'LOW':
        return 'border-green-300 bg-green-50 shadow-md ring-1 ring-green-200';
      default:
        return 'border-gray-300 bg-gray-50 shadow-md ring-1 ring-gray-200';
    }
  };

  // Function to get priority text colors
  const getPriorityTextColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return { title: 'text-red-900', subtitle: 'text-red-700', balance: 'text-red-800' };
      case 'MEDIUM':
        return { title: 'text-orange-900', subtitle: 'text-orange-700', balance: 'text-orange-800' };
      case 'LOW':
        return { title: 'text-green-900', subtitle: 'text-green-700', balance: 'text-green-800' };
      default:
        return { title: 'text-gray-900', subtitle: 'text-gray-700', balance: 'text-gray-800' };
    }
  };

  // Function to get priority badge styling
  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'MEDIUM':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'LOW':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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

  // Group investigations by priority
  const groupedInvestigations = {
    high: investigations?.filter(inv => inv.priority === 'HIGH') || [],
    medium: investigations?.filter(inv => inv.priority === 'MEDIUM') || [],
    low: investigations?.filter(inv => inv.priority === 'LOW') || []
  };

  const renderInvestigationSection = (title: string, investigations: any[], priority: string, iconColor: string) => {
    if (investigations.length === 0) return null;

    return (
      <div className="space-y-4 mb-8">
        <div className="flex items-center gap-2 pb-2 border-b">
          <div className={`w-3 h-3 rounded-full ${iconColor}`}></div>
          <h3 className="text-lg font-semibold text-gray-900">
            {title} ({investigations.length})
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {investigations.map((investigation) => {
            const cardStyle = getPriorityCardStyle(investigation.priority);
            const textColors = getPriorityTextColor(investigation.priority);
            const badgeStyle = getPriorityBadgeStyle(investigation.priority);
            
            return (
              <div 
                key={investigation.id} 
                className={`border rounded-lg p-4 transition-all duration-200 ${cardStyle}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h4 className={`font-medium mb-1 ${textColors.title}`}>
                      {investigation.bank_accounts?.bank_name || 'Unknown Bank'}
                    </h4>
                    <p className={`text-sm mb-2 ${textColors.subtitle}`}>
                      {investigation.bank_accounts?.account_name || 'Unknown Account'}
                    </p>
                    <Badge 
                      variant="secondary"
                      className={`flex items-center gap-1 w-fit ${badgeStyle}`}
                    >
                      {getPriorityIcon(investigation.priority)}
                      {investigation.priority}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div>
                    <span className={`text-xs font-medium ${textColors.subtitle}`}>Type:</span>
                    <p className={`text-sm ${textColors.title}`}>{investigation.investigation_type || 'N/A'}</p>
                  </div>
                  <div>
                    <span className={`text-xs font-medium ${textColors.subtitle}`}>Reason:</span>
                    <p className={`text-sm line-clamp-2 ${textColors.title}`}>{investigation.reason || 'No reason provided'}</p>
                  </div>
                  <div>
                    <span className={`text-xs font-medium ${textColors.subtitle}`}>Started:</span>
                    <p className={`text-sm ${textColors.title}`}>
                      {investigation.created_at ? formatDate(investigation.created_at) : 'Unknown'}
                    </p>
                  </div>
                  {investigation.resolution_notes && (
                    <div>
                      <span className={`text-xs font-medium ${textColors.subtitle}`}>Status:</span>
                      <Badge variant="secondary" className="ml-1 bg-orange-100 text-orange-800">
                        Pending Banking Officer Approval
                      </Badge>
                    </div>
                  )}
                </div>

                <Button 
                  size="sm" 
                  variant="outline" 
                  className={`w-full border-current ${
                    investigation.priority === 'HIGH' 
                      ? 'border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400' 
                      : investigation.priority === 'MEDIUM'
                      ? 'border-orange-300 text-orange-700 hover:bg-orange-100 hover:border-orange-400'
                      : 'border-green-300 text-green-700 hover:bg-green-100 hover:border-green-400'
                  }`}
                  onClick={() => handleViewDetails(investigation)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
            <div className="space-y-8">
              {renderInvestigationSection(
                "🚨 High Priority Investigations", 
                groupedInvestigations.high, 
                "HIGH", 
                "bg-red-500"
              )}
              {renderInvestigationSection(
                "⚠️ Medium Priority Investigations", 
                groupedInvestigations.medium, 
                "MEDIUM", 
                "bg-orange-500"
              )}
              {renderInvestigationSection(
                "ℹ️ Low Priority Investigations", 
                groupedInvestigations.low, 
                "LOW", 
                "bg-green-500"
              )}
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