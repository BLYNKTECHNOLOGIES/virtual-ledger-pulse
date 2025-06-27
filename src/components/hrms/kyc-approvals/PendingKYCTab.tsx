import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Eye, CheckCircle, XCircle, MessageSquare, Plus, FileText, Video, Play } from "lucide-react";
import { KYCDetailsDialog } from "./KYCDetailsDialog";
import { CreateKYCRequestDialog } from "./CreateKYCRequestDialog";
import { CreateQueryDialog } from "./CreateQueryDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface KYCRequest {
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
  created_by: string | null;
  kyc_queries?: Array<{
    id: string;
    resolved: boolean;
    response_text: string | null;
    resolved_at: string | null;
    manual_query: string | null;
    vkyc_required: boolean;
  }>;
}

export function PendingKYCTab() {
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [createRequestOpen, setCreateRequestOpen] = useState(false);
  const [createQueryOpen, setCreateQueryOpen] = useState(false);
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<KYCRequest | null>(null);
  const [kycRequests, setKycRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchKYCRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select(`
          *,
          kyc_queries (
            id,
            resolved,
            response_text,
            resolved_at,
            manual_query,
            vkyc_required
          )
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setKycRequests(data || []);
    } catch (error) {
      console.error('Error fetching KYC requests:', error);
      toast({
        title: "Error",
        description: "Failed to fetch KYC requests.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKYCRequests();
  }, []);

  const handleViewDetails = (kyc: KYCRequest) => {
    setSelectedKYC(kyc);
    setDetailsDialogOpen(true);
  };

  const handleViewVideo = (kyc: KYCRequest) => {
    setSelectedKYC(kyc);
    setVideoViewerOpen(true);
  };

  const handleApprove = async (kycId: string) => {
    try {
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({ status: 'APPROVED' })
        .eq('id', kycId);

      if (error) {
        throw error;
      }

      toast({
        title: "KYC Approved",
        description: "KYC request has been approved successfully.",
      });

      fetchKYCRequests();
    } catch (error) {
      console.error('Error approving KYC:', error);
      toast({
        title: "Error",
        description: "Failed to approve KYC request.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (kycId: string) => {
    try {
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({ status: 'REJECTED' })
        .eq('id', kycId);

      if (error) {
        throw error;
      }

      toast({
        title: "KYC Rejected",
        description: "KYC request has been rejected.",
      });

      fetchKYCRequests();
    } catch (error) {
      console.error('Error rejecting KYC:', error);
      toast({
        title: "Error",
        description: "Failed to reject KYC request.",
        variant: "destructive",
      });
    }
  };

  const handleQuery = async (kyc: KYCRequest) => {
    setSelectedKYC(kyc);
    setCreateQueryOpen(true);
  };

  const handleStartVideoKYC = async (kycId: string) => {
    try {
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({ status: 'VIDEO_KYC' })
        .eq('id', kycId);

      if (error) {
        throw error;
      }

      toast({
        title: "Video KYC Started",
        description: "KYC request has been moved to Video KYC tab.",
      });

      fetchKYCRequests();
    } catch (error) {
      console.error('Error starting Video KYC:', error);
      toast({
        title: "Error",
        description: "Failed to start Video KYC.",
        variant: "destructive",
      });
    }
  };

  const handleQueryCreated = async () => {
    await fetchKYCRequests();
  };

  const isVideoKYCCompleted = (kyc: KYCRequest) => {
    return kyc.additional_info?.includes('Video KYC Completed Successfully');
  };

  const getVKYCVideoUrl = (kyc: KYCRequest) => {
    if (!kyc.additional_info) return null;
    
    // First check if there's a video URL in additional_info
    const videoUrlMatch = kyc.additional_info.match(/Video URL: (https?:\/\/[^\s]+)/);
    if (videoUrlMatch) {
      return videoUrlMatch[1];
    }
    
    // Fallback: check if verified_feedback_url or negative_feedback_url contains a video
    if (kyc.verified_feedback_url && kyc.verified_feedback_url.includes('vkyc-videos')) {
      return kyc.verified_feedback_url;
    }
    
    if (kyc.negative_feedback_url && kyc.negative_feedback_url.includes('vkyc-videos')) {
      return kyc.negative_feedback_url;
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading KYC requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pending KYC Approvals</h3>
        <Button onClick={() => setCreateRequestOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Request
        </Button>
      </div>

      {kycRequests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No pending KYC requests found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {kycRequests.map((kyc) => (
            <Card key={kyc.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    {kyc.counterparty_name}
                    {isVideoKYCCompleted(kyc) && (
                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                        VKYC COMPLETED
                      </Badge>
                    )}
                  </CardTitle>
                  <Badge variant="secondary">PENDING</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Order Amount</p>
                    <p className="font-medium">₹{kyc.order_amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Purpose</p>
                    <p className="font-medium">{kyc.purpose_of_buying || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Requested Date</p>
                    <p className="font-medium">{new Date(kyc.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Documents</p>
                    <div className="flex gap-1 flex-wrap">
                      {kyc.aadhar_front_url && <Badge variant="outline" className="text-green-600 text-xs">Aadhar Front</Badge>}
                      {kyc.aadhar_back_url && <Badge variant="outline" className="text-green-600 text-xs">Aadhar Back</Badge>}
                      <Badge variant="outline" className="text-blue-600 text-xs">Binance ID</Badge>
                      {kyc.verified_feedback_url && <Badge variant="outline" className="text-green-600 text-xs">Verified FB</Badge>}
                      {kyc.negative_feedback_url && <Badge variant="outline" className="text-red-600 text-xs">Negative FB</Badge>}
                      {kyc.additional_documents_url && <Badge variant="outline" className="text-purple-600 text-xs">Additional</Badge>}
                    </div>
                  </div>
                </div>

                {kyc.additional_info && (
                  <div className="mb-4 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                    <p className="text-sm font-medium text-blue-800">Additional Info:</p>
                    <p className="text-sm text-blue-700">{kyc.additional_info}</p>
                  </div>
                )}
                
                {kyc.kyc_queries && kyc.kyc_queries.length > 0 && (
                  <div className="mb-4">
                    {kyc.kyc_queries.map((query) => (
                      query.resolved && (
                        <div key={query.id} className="p-3 bg-green-50 rounded border-l-4 border-green-400 mb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Query Resolution
                                {query.resolved_at && (
                                  <span className="text-xs text-green-600 font-normal">
                                    • Resolved {new Date(query.resolved_at).toLocaleDateString()}
                                  </span>
                                )}
                              </p>
                              {query.response_text && (
                                <p className="text-sm text-green-700 mt-1">{query.response_text}</p>
                              )}
                              {query.manual_query && (
                                <div className="mt-2 text-xs text-green-600">
                                  <span className="font-medium">Original Query: </span>
                                  {query.manual_query}
                                </div>
                              )}
                            </div>
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              RESOLVED
                            </Badge>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handleViewDetails(kyc)} className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    View Details
                  </Button>
                  {isVideoKYCCompleted(kyc) && getVKYCVideoUrl(kyc) && (
                    <Button variant="outline" size="sm" onClick={() => handleViewVideo(kyc)} className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      View VKYC Video
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleApprove(kyc.id)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleReject(kyc.id)} className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleQuery(kyc)} className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Query
                  </Button>
                  {!isVideoKYCCompleted(kyc) && (
                    <Button size="sm" onClick={() => handleStartVideoKYC(kyc.id)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
                      <Video className="h-4 w-4" />
                      Start Video KYC
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

      <CreateKYCRequestDialog
        open={createRequestOpen}
        onOpenChange={setCreateRequestOpen}
        onSuccess={fetchKYCRequests}
      />

      <CreateQueryDialog
        open={createQueryOpen}
        onOpenChange={setCreateQueryOpen}
        kycRequest={selectedKYC}
        onSuccess={handleQueryCreated}
      />

      {/* Video Viewer Dialog */}
      <Dialog open={videoViewerOpen} onOpenChange={setVideoViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              VKYC Recording - {selectedKYC?.counterparty_name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {selectedKYC && getVKYCVideoUrl(selectedKYC) ? (
              <video 
                controls 
                className="w-full max-h-96"
                src={getVKYCVideoUrl(selectedKYC)}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="text-center p-8 text-gray-500">
                <Video className="h-12 w-12 mx-auto mb-4" />
                <p>No VKYC recording available for this request.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
