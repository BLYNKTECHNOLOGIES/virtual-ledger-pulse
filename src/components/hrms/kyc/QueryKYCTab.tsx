
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, HelpCircle, CheckCircle, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KYCRequestDetailsDialog } from "./KYCRequestDetailsDialog";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
  purpose_of_buying: string;
  status: string;
  created_at: string;
  queries?: KYCQuery[];
}

interface KYCQuery {
  id: string;
  query_type: string;
  vkyc_required: boolean;
  manual_query_text: string;
  resolved: boolean;
  created_at: string;
}

export function QueryKYCTab() {
  const [requests, setRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<KYCRequest | null>(null);

  useEffect(() => {
    fetchQueriedRequests();
  }, []);

  const fetchQueriedRequests = async () => {
    try {
      const { data: requestsData, error: requestsError } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('status', 'QUERY')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Fetch queries for each request
      const requestsWithQueries = await Promise.all(
        (requestsData || []).map(async (request) => {
          const { data: queriesData } = await supabase
            .from('kyc_queries')
            .select('*')
            .eq('kyc_request_id', request.id)
            .order('created_at', { ascending: false });

          return { ...request, queries: queriesData || [] };
        })
      );

      setRequests(requestsWithQueries);
    } catch (error) {
      console.error('Error fetching queried requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (request: KYCRequest) => {
    setSelectedRequest(request);
    setShowDetailsDialog(true);
  };

  const handleResolveQuery = async (queryId: string, response: string) => {
    try {
      const { error } = await supabase
        .from('kyc_queries')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          response_text: response
        })
        .eq('id', queryId);

      if (error) throw error;
      fetchQueriedRequests();
    } catch (error) {
      console.error('Error resolving query:', error);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">KYC Requests with Queries</h3>

      <div className="grid gap-4">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{request.counterparty_name}</h4>
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Query Raised
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Order Amount: ₹{request.order_amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    Purpose: {request.purpose_of_buying || 'Not specified'}
                  </p>
                  
                  {request.queries && request.queries.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h5 className="font-medium text-sm">Queries:</h5>
                      {request.queries.map((query) => (
                        <div key={query.id} className="bg-gray-50 p-3 rounded text-sm">
                          {query.vkyc_required && (
                            <p className="text-orange-600 font-medium">Video KYC Required</p>
                          )}
                          {query.manual_query_text && (
                            <p className="text-gray-700">{query.manual_query_text}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {query.resolved ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Resolved
                              </Badge>
                            ) : (
                              <Badge variant="outline">Pending Response</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
            <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Queries</h3>
            <p className="text-gray-600">No KYC requests have queries raised.</p>
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
