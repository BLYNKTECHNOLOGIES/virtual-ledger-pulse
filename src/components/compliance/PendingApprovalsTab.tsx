import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Clock, FileText, ExternalLink, CheckCircle, X, Eye } from "lucide-react";

export function PendingApprovalsTab() {
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending approvals
  const { data: pendingApprovals, isLoading } = useQuery({
    queryKey: ['pending_approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investigation_approvals')
        .select(`
          *,
          bank_cases!inner(
            id,
            bank_account_id,
            case_type,
            priority,
            title,
            description,
            bank_accounts(
              bank_name,
              account_name,
              account_number
            )
          )
        `)
        .eq('approval_status', 'PENDING')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Approve investigation mutation
  const approveMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const approval = pendingApprovals?.find(a => a.id === approvalId);
      if (!approval) throw new Error('Approval not found');

      // Update approval status
      const { error: approvalError } = await supabase
        .from('investigation_approvals')
        .update({
          approval_status: 'APPROVED',
          approved_by: 'Current Officer',
          approved_at: new Date().toISOString()
        })
        .eq('id', approvalId);

      if (approvalError) throw approvalError;

      // Update bank case status to RESOLVED and investigation_status to COMPLETED
      const { error: caseError } = await supabase
        .from('bank_cases')
        .update({
          status: 'RESOLVED',
          investigation_status: 'COMPLETED',
          resolved_at: new Date().toISOString(),
          resolved_by: 'Banking Officer',
          resolution_notes: approval.final_resolution
        })
        .eq('id', approval.investigation_id);

      if (caseError) throw caseError;

      return approvalId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending_approvals'] });
      queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
      queryClient.invalidateQueries({ queryKey: ['past_investigations'] });
      queryClient.invalidateQueries({ queryKey: ['bank_cases'] });
      toast({
        title: "Investigation Approved",
        description: "Case has been resolved and moved to past cases.",
      });
      setShowApprovalDialog(false);
      setSelectedApproval(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to approve investigation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject investigation mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ approvalId, reason }: { approvalId: string; reason: string }) => {
      const approval = pendingApprovals?.find(a => a.id === approvalId);
      if (!approval) throw new Error('Approval not found');

      // Update approval status
      const { error: approvalError } = await supabase
        .from('investigation_approvals')
        .update({
          approval_status: 'REJECTED',
          approved_by: 'Current Officer',
          approved_at: new Date().toISOString(),
          rejection_reason: reason
        })
        .eq('id', approvalId);

      if (approvalError) throw approvalError;

      // Update bank case status back to UNDER_INVESTIGATION (not PENDING_APPROVAL)
      const { error: caseError } = await supabase
        .from('bank_cases')
        .update({
          status: 'UNDER_INVESTIGATION',
          investigation_status: 'UNDER_INVESTIGATION'
        })
        .eq('id', approval.investigation_id);

      if (caseError) throw caseError;

      return approvalId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending_approvals'] });
      queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
      queryClient.invalidateQueries({ queryKey: ['bank_cases'] });
      toast({
        title: "Investigation Rejected",
        description: "Case has been sent back for further investigation.",
      });
      setShowRejectionDialog(false);
      setSelectedApproval(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to reject investigation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleViewDetails = (approval: any) => {
    setSelectedApproval(approval);
    setShowApprovalDialog(true);
  };

  const handleApprove = () => {
    if (selectedApproval) {
      approveMutation.mutate(selectedApproval.id);
    }
  };

  const handleReject = () => {
    setShowApprovalDialog(false);
    setShowRejectionDialog(true);
  };

  const handleSubmitRejection = () => {
    if (selectedApproval && rejectionReason.trim()) {
      rejectMutation.mutate({
        approvalId: selectedApproval.id,
        reason: rejectionReason
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'default';
      case 'LOW': return 'secondary';
      default: return 'default';
    }
  };

  const getDurationSinceSubmission = (submittedAt: string) => {
    const now = new Date();
    const submitted = new Date(submittedAt);
    const diffInHours = Math.floor((now.getTime() - submitted.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            Pending Officer Approval
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Loading pending approvals...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            Pending Officer Approval ({pendingApprovals?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!pendingApprovals || pendingApprovals.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">All Clear!</h3>
              <p className="text-gray-500">No investigations pending officer approval.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="p-4 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={getPriorityColor(approval.bank_cases.priority)}>
                          {approval.bank_cases.priority}
                        </Badge>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          PENDING APPROVAL
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {getDurationSinceSubmission(approval.submitted_at)}
                        </span>
                      </div>
                      
                      <div className="mb-3">
                        <h4 className="font-medium text-gray-900 mb-1">
                          {approval.bank_cases.bank_accounts?.bank_name || 'Unknown Bank'}
                        </h4>
                        <p className="text-sm text-gray-600 mb-1">
                          Account: {approval.bank_cases.bank_accounts?.account_name || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-600">
                          Title: {approval.bank_cases.title}
                        </p>
                        <p className="text-sm text-gray-500">
                          Type: {approval.bank_cases.case_type?.replace(/_/g, ' ')}
                        </p>
                      </div>

                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">Final Resolution Summary:</p>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border">
                          {approval.final_resolution.length > 200 
                            ? `${approval.final_resolution.substring(0, 200)}...` 
                            : approval.final_resolution}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Submitted by: {approval.submitted_by}</span>
                        {approval.supporting_documents_urls && approval.supporting_documents_urls.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {approval.supporting_documents_urls.length} documents
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(approval)}
                        className="flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        Review & Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Details Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Investigation Approval Review</DialogTitle>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-6 p-4">
              {/* Case Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Case Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Bank:</span>
                    <p>{selectedApproval.account_investigations.bank_accounts?.bank_name}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Account:</span>
                    <p>{selectedApproval.account_investigations.bank_accounts?.account_name}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Priority:</span>
                    <p>
                      <Badge variant={getPriorityColor(selectedApproval.account_investigations.priority)}>
                        {selectedApproval.account_investigations.priority}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Type:</span>
                    <p>{selectedApproval.account_investigations.investigation_type}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-gray-700">Reason:</span>
                    <p>{selectedApproval.account_investigations.reason}</p>
                  </div>
                </div>
              </div>

              {/* Final Resolution */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Final Resolution</h3>
                <div className="bg-white p-3 rounded border">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {selectedApproval.final_resolution}
                  </p>
                </div>
              </div>

              {/* Supporting Documents */}
              {selectedApproval.supporting_documents_urls && selectedApproval.supporting_documents_urls.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Supporting Documents</h3>
                  <div className="space-y-2">
                    {selectedApproval.supporting_documents_urls.map((url: string, index: number) => {
                      const fileName = url.split('/').pop()?.split('-').slice(3).join('-') || `Document ${index + 1}`;
                      return (
                        <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded border">
                          <FileText className="h-4 w-4 text-blue-600" />
                          <span className="text-sm text-gray-800 flex-1">{fileName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(url, '_blank')}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submission Details */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Submission Details</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Submitted by:</span> {selectedApproval.submitted_by}</p>
                  <p><span className="font-medium">Submitted at:</span> {new Date(selectedApproval.submitted_at).toLocaleString()}</p>
                  <p><span className="font-medium">Duration:</span> {getDurationSinceSubmission(selectedApproval.submitted_at)}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowApprovalDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReject}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve & Resolve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Investigation</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 p-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Provide a clear reason for rejecting this investigation..."
                rows={4}
                className="w-full"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectionDialog(false);
                  setRejectionReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRejection}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Submit Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}