import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CheckCircle, XCircle, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ReKYCForm } from "./ReKYCForm";

interface ReKYCRequest {
  id: string;
  risk_flag_id: string;
  user_id: string;
  status: string;
  created_at: string;
  submitted_at?: string;
  vkyc_completed: boolean;
  users: {
    username: string;
    email: string;
  };
  risk_flags: {
    flag_reason: string;
    risk_score: number;
  };
}

export function UnderReKYCTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<ReKYCRequest | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);

  const { data: rekycRequests, isLoading } = useQuery({
    queryKey: ["rekyc-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rekyc_requests")
        .select(`
          *,
          users!inner(username, email),
          risk_flags!inner(flag_reason, risk_score)
        `)
        .in("status", ["PENDING", "SUBMITTED", "UNDER_REVIEW"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as any;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, decision, notes }: { requestId: string; decision: string; notes: string }) => {
      const { error } = await supabase
        .from("rekyc_requests")
        .update({
          status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
          review_decision: decision,
          review_notes: notes,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", requestId);

      if (error) throw error;

      // If approved, clear the risk flag
      if (decision === "APPROVED" && selectedRequest) {
        await supabase.rpc("update_risk_flag_status", {
          flag_id: selectedRequest.risk_flag_id,
          new_status: "CLEARED",
          notes: `ReKYC approved: ${notes}`
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rekyc-requests"] });
      queryClient.invalidateQueries({ queryKey: ["risk-stats"] });
      toast({
        title: "Success",
        description: `ReKYC request ${reviewDecision?.toLowerCase()} successfully`,
      });
      setIsReviewDialogOpen(false);
      setReviewNotes("");
      setReviewDecision(null);
      setSelectedRequest(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReview = (request: ReKYCRequest, decision: "APPROVED" | "REJECTED") => {
    setSelectedRequest(request);
    setReviewDecision(decision);
    setIsReviewDialogOpen(true);
  };

  const handleViewForm = (request: ReKYCRequest) => {
    setSelectedRequest(request);
    setIsFormDialogOpen(true);
  };

  const executeReview = () => {
    if (!selectedRequest || !reviewDecision) return;

    reviewMutation.mutate({
      requestId: selectedRequest.id,
      decision: reviewDecision,
      notes: reviewNotes
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      PENDING: "outline",
      SUBMITTED: "secondary",
      UNDER_REVIEW: "default"
    };
    return variants[status] || "outline";
  };

  if (isLoading) {
    return <div>Loading ReKYC requests...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" />
          Under ReKYC
        </CardTitle>
        <CardDescription>
          Clients currently undergoing the ReKYC verification process
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rekycRequests && rekycRequests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Risk Reason</TableHead>
                <TableHead>ReKYC Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>vKYC Done</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rekycRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{request.users.username}</div>
                      <div className="text-sm text-muted-foreground">{request.users.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm">{request.risk_flags.flag_reason}</p>
                      <Badge variant="outline" className="mt-1">
                        Score: {request.risk_flags.risk_score}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(request.created_at), "MMM dd, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadge(request.status)}>
                      {request.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={request.vkyc_completed ? "default" : "secondary"}>
                      {request.vkyc_completed ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewForm(request)}
                        className="flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                      {request.status === "SUBMITTED" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleReview(request, "APPROVED")}
                            className="flex items-center gap-1"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReview(request, "REJECTED")}
                            className="flex items-center gap-1"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No ReKYC requests found</p>
          </div>
        )}

        {/* Review Dialog */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {reviewDecision === "APPROVED" ? "Approve ReKYC" : "Reject ReKYC"}
              </DialogTitle>
              <DialogDescription>
                {reviewDecision === "APPROVED" 
                  ? "This will approve the ReKYC request and clear the client's risk flag."
                  : "This will reject the ReKYC request. The client will remain flagged."
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="review-notes">Review Notes *</Label>
                <Textarea
                  id="review-notes"
                  placeholder="Provide detailed reasoning for your decision..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={executeReview}
                  variant={reviewDecision === "REJECTED" ? "destructive" : "default"}
                  disabled={!reviewNotes.trim() || reviewMutation.isPending}
                >
                  {reviewMutation.isPending ? "Processing..." : "Confirm"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ReKYC Form Dialog */}
        <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ReKYC Submission</DialogTitle>
              <DialogDescription>
                Review the client's ReKYC submission
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <ReKYCForm 
                requestId={selectedRequest.id}
                isReadOnly={true}
                onClose={() => setIsFormDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}