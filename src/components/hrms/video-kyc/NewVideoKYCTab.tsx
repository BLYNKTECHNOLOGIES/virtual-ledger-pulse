
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Video, Calendar, Clock } from "lucide-react";
import { VideoKYCSessionDialog } from "./VideoKYCSessionDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VideoKYCRequest {
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
}

export function NewVideoKYCTab() {
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<VideoKYCRequest | null>(null);
  const [videoKYCRequests, setVideoKYCRequests] = useState<VideoKYCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchVideoKYCRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('status', 'VIDEO_KYC')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setVideoKYCRequests(data || []);
    } catch (error) {
      console.error('Error fetching Video KYC requests:', error);
      toast({
        title: "Error",
        description: "Failed to fetch Video KYC requests.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoKYCRequests();
  }, []);

  const handleViewKYC = (kyc: VideoKYCRequest) => {
    setSelectedKYC(kyc);
    setSessionDialogOpen(true);
  };

  const handleSessionComplete = () => {
    fetchVideoKYCRequests();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading Video KYC requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Video KYC Sessions</h3>
        <div className="text-sm text-gray-500">
          Total Sessions: {videoKYCRequests.length}
        </div>
      </div>

      {videoKYCRequests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No Video KYC sessions available.</p>
            <p className="text-sm text-gray-400 mt-2">
              KYC requests will appear here when moved to Video KYC from Pending tab.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {videoKYCRequests.map((kyc) => (
            <Card key={kyc.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    {kyc.counterparty_name}
                  </CardTitle>
                  <Badge className="bg-blue-100 text-blue-800">
                    VIDEO KYC READY
                  </Badge>
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
                    <p className="text-sm font-medium text-gray-500">Documents Status</p>
                    <div className="flex gap-1 flex-wrap">
                      {kyc.aadhar_front_url && <Badge variant="outline" className="text-green-600 text-xs">Aadhar</Badge>}
                      <Badge variant="outline" className="text-blue-600 text-xs">Binance ID</Badge>
                      {kyc.verified_feedback_url && <Badge variant="outline" className="text-green-600 text-xs">Feedback</Badge>}
                    </div>
                  </div>
                </div>

                {kyc.additional_info && (
                  <div className="mb-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                    <p className="text-sm font-medium text-blue-800">Additional Information:</p>
                    <p className="text-sm text-blue-700">{kyc.additional_info}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleViewKYC(kyc)} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <Video className="h-4 w-4" />
                    Conduct Video KYC
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VideoKYCSessionDialog
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        kycRequest={selectedKYC}
        onSuccess={handleSessionComplete}
      />
    </div>
  );
}
