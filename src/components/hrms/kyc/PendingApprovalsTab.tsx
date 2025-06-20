
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Check, X, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CreateKYCRequestDialog } from "./CreateKYCRequestDialog";
import { KYCRequestDetailsDialog } from "./KYCRequestDetailsDialog";
import { ApproveKYCDialog } from "./ApproveKYCDialog";
import { RejectKYCDialog } from "./RejectKYCDialog";
import { QueryKYCDialog } from "./QueryKYCDialog";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
  purpose_of_buying: string;
  status: string;
  created_at: string;
  requested_by: string;
}

export function PendingApprovalsTab() {
  const [requests, setRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showQueryDialog, setShowQueryDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<KYCRequest | null>(null);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (request: KYCRequest) => {
    setSelectedRequest(request);
    setShowDetailsDialog(true);
  };

  const handleApprove = (request: KYCRequest) => {
    setSelectedRequest(request);
    setShowApproveDialog(true);
  };

  const handleReject = (request: KYCRequest) => {
    setSelectedRequest(request);
    setShowRejectDialog(true);
  };

  const handleQuery = (request: KYCRequest) => {
    setSelectedRequest(request);
    setShowQueryDialog(true);
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pending KYC Approvals</h3>
        <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New KYC Request
        </Button>
      </div>

      <div className="grid gap-4">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{request.counterparty_name}</h4>
                    <Badge variant="outline">Pending</Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Order Amount: ₹{request.order_amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    Purpose: {request.purpose_of_buying || 'Not specified'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Requested: {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetails(request)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleApprove(request)}
                    className="text-green-600 hover:text-green-700"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReject(request)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuery(request)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {requests.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Requests</h3>
            <p className="text-gray-600">All KYC requests have been processed.</p>
          </CardContent>
        </Card>
      )}

      <CreateKYCRequestDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={fetchPendingRequests}
      />

      <KYCRequestDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        request={selectedRequest}
      />

      <ApproveKYCDialog
        open={showApproveDialog}
        onOpenChange={setShowApproveDialog}
        request={selectedRequest}
        onSuccess={fetchPendingRequests}
      />

      <RejectKYCDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        request={selectedRequest}
        onSuccess={fetchPendingRequests}
      />

      <QueryKYCDialog
        open={showQueryDialog}
        onOpenChange={setShowQueryDialog}
        request={selectedRequest}
        onSuccess={fetchPendingRequests}
      />
    </div>
  );
}
