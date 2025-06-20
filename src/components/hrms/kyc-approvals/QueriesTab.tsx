
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Eye, MessageSquare, Video, Calendar } from "lucide-react";
import { KYCDetailsDialog } from "./KYCDetailsDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface KYCQuery {
  id: string;
  kyc_request_id: string;
  vkyc_required: boolean;
  manual_query: string | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  response_text: string | null;
  kyc_approval_requests: {
    id: string;
    counterparty_name: string;
    order_amount: number;
    purpose_of_buying: string | null;
    additional_info: string | null;
    aadhar_front_url: string | null;
    aadhar_back_url: string | null;
    verified_feedback_url: string | null;
    negative_feedback_url: string | null;
    binance_id_screenshot_url: string;
    additional_documents_url: string | null;
    status: string;
    created_at: string;
  };
}

export function QueriesTab() {
  const [queries, setQueries] = useState<KYCQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<any>(null);
  const { toast } = useToast();

  const fetchQueries = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_queries')
        .select(`
          *,
          kyc_approval_requests (*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setQueries(data || []);
    } catch (error) {
      console.error('Error fetching queries:', error);
      toast({
        title: "Error",
        description: "Failed to fetch KYC queries.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueries();
  }, []);

  const handleViewKYCDetails = (kycRequest: any) => {
    setSelectedKYC(kycRequest);
    setDetailsDialogOpen(true);
  };

  const handleResolveQuery = async (queryId: string) => {
    try {
      const { error } = await supabase
        .from('kyc_queries')
        .update({ 
          resolved: true, 
          resolved_at: new Date().toISOString(),
          response_text: "Query resolved by compliance officer"
        })
        .eq('id', queryId);

      if (error) {
        throw error;
      }

      toast({
        title: "Query Resolved",
        description: "Query has been marked as resolved.",
      });

      fetchQueries();
    } catch (error) {
      console.error('Error resolving query:', error);
      toast({
        title: "Error",
        description: "Failed to resolve query.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading queries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">KYC Queries</h3>
        <div className="text-sm text-gray-500">
          Total Queries: {queries.length}
        </div>
      </div>

      {queries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No KYC queries found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {queries.map((query) => (
            <Card key={query.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Query for {query.kyc_approval_requests.counterparty_name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge className={query.resolved ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                      {query.resolved ? "RESOLVED" : "PENDING"}
                    </Badge>
                    <Badge variant="outline">QUERIED</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Order Amount</p>
                    <p className="font-medium">₹{query.kyc_approval_requests.order_amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Purpose</p>
                    <p className="font-medium">{query.kyc_approval_requests.purpose_of_buying || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Query Date</p>
                    <p className="font-medium">{new Date(query.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Query Type</p>
                    <div className="flex gap-1 flex-wrap">
                      {query.vkyc_required && (
                        <Badge variant="outline" className="text-blue-600 flex items-center gap-1">
                          <Video className="h-3 w-3" />
                          VKYC
                        </Badge>
                      )}
                      {query.manual_query && (
                        <Badge variant="outline" className="text-purple-600">Manual</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {query.manual_query && (
                  <div className="mb-4 p-3 bg-purple-50 rounded border-l-4 border-purple-400">
                    <p className="text-sm font-medium text-purple-800">Manual Query:</p>
                    <p className="text-sm text-purple-700">{query.manual_query}</p>
                  </div>
                )}

                {query.vkyc_required && (
                  <div className="mb-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                    <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Video KYC Required
                    </p>
                    <p className="text-sm text-blue-700">This request requires a video KYC session to be completed.</p>
                  </div>
                )}

                {query.resolved && query.resolved_at && (
                  <div className="mb-4 p-3 bg-green-50 rounded border-l-4 border-green-400">
                    <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Resolved on {new Date(query.resolved_at).toLocaleDateString()}
                    </p>
                    {query.response_text && (
                      <p className="text-sm text-green-700">{query.response_text}</p>
                    )}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleViewKYCDetails(query.kyc_approval_requests)} className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    View KYC Details
                  </Button>
                  {!query.resolved && (
                    <Button size="sm" onClick={() => handleResolveQuery(query.id)} className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Mark as Resolved
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <KYCDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        kycRequest={selectedKYC}
      />
    </div>
  );
}
