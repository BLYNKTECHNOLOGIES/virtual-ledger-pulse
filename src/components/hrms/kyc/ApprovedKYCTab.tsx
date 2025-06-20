
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KYCRequestDetailsDialog } from "./KYCRequestDetailsDialog";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
  purpose_of_buying: string;
  status: string;
  created_at: string;
  review_date: string;
  reviewed_by: string;
}

export function ApprovedKYCTab() {
  const [requests, setRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<KYCRequest | null>(null);

  useEffect(() => {
    fetchApprovedRequests();
  }, []);

  const fetchApprovedRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('status', 'APPROVED')
        .order('review_date', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching approved requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (request: KYCRequest) => {
    setSelectedRequest(request);
    setShowDetailsDialog(true);
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Approved KYC Requests</h3>

      <div className="grid gap-4">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{request.counterparty_name}</h4>
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Approved
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Order Amount: ₹{request.order_amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    Purpose: {request.purpose_of_buying || 'Not specified'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Approved: {new Date(request.review_date).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewDetails(request)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {requests.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Approved Requests</h3>
            <p className="text-gray-600">No KYC requests have been approved yet.</p>
          </CardContent>
        </Card>
      )}

      <KYCRequestDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        request={selectedRequest}
      />
    </div>
  );
}
