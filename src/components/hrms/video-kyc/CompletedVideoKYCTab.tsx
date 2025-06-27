
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, User, Video, Calendar, FileText, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CompletedVideoKYC {
  id: string;
  counterparty_name: string;
  order_amount: number;
  purpose_of_buying: string | null;
  additional_info: string | null;
  status: string;
  created_at: string;
  binance_id_screenshot_url: string;
  aadhar_front_url: string | null;
  aadhar_back_url: string | null;
  verified_feedback_url: string | null;
  negative_feedback_url: string | null;
  additional_documents_url: string | null;
}

export function CompletedVideoKYCTab() {
  const [completedKYCs, setCompletedKYCs] = useState<CompletedVideoKYC[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<CompletedVideoKYC | null>(null);
  const { toast } = useToast();

  const fetchCompletedVideoKYCs = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .in('status', ['APPROVED', 'REJECTED'])
        .like('additional_info', '%Video KYC Completed%')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setCompletedKYCs(data || []);
    } catch (error) {
      console.error('Error fetching completed Video KYCs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch completed Video KYCs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompletedVideoKYCs();
  }, []);

  const handleViewVideo = (kyc: CompletedVideoKYC) => {
    setSelectedKYC(kyc);
    setVideoViewerOpen(true);
  };

  const extractRatingFromNotes = (notes: string | null) => {
    if (!notes) return "N/A";
    const ratingMatch = notes.match(/Rating: (\d+)\/10/);
    return ratingMatch ? `${ratingMatch[1]}/10` : "N/A";
  };

  const extractCompletionDate = (notes: string | null, createdAt: string) => {
    // For now, we'll use the created_at date as completion date
    // In a real scenario, you might want to add a completed_at field
    return new Date(createdAt).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading completed Video KYCs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Completed Video KYC Sessions</h3>
        <div className="text-sm text-gray-500">
          Total Completed: {completedKYCs.length}
        </div>
      </div>

      {completedKYCs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No completed Video KYC sessions found.</p>
            <p className="text-sm text-gray-400 mt-2">
              Completed sessions will appear here after Video KYC is conducted.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {completedKYCs.map((kyc) => (
            <Card key={kyc.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    {kyc.counterparty_name}
                  </CardTitle>
                  <Badge 
                    variant="outline" 
                    className={
                      kyc.status === 'APPROVED' 
                        ? "bg-green-50 text-green-700 border-green-200" 
                        : "bg-red-50 text-red-700 border-red-200"
                    }
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    VIDEO KYC {kyc.status}
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
                    <p className="text-sm font-medium text-gray-500">Completion Date</p>
                    <p className="font-medium">{extractCompletionDate(kyc.additional_info, kyc.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Rating</p>
                    <p className="font-medium">{extractRatingFromNotes(kyc.additional_info)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Purpose</p>
                    <p className="font-medium">{kyc.purpose_of_buying || "Not specified"}</p>
                  </div>
                </div>
                
                {kyc.additional_info && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-500 mb-1">Session Notes</p>
                    <p className="text-sm bg-gray-50 p-2 rounded">{kyc.additional_info}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2"
                    onClick={() => handleViewVideo(kyc)}
                  >
                    <Play className="h-4 w-4" />
                    View Recording
                  </Button>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Download Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Video Viewer Dialog */}
      <Dialog open={videoViewerOpen} onOpenChange={setVideoViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              Video KYC Recording - {selectedKYC?.counterparty_name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {selectedKYC?.binance_id_screenshot_url ? (
              <video 
                controls 
                className="w-full max-h-96"
                src={selectedKYC.binance_id_screenshot_url}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="text-center p-8 text-gray-500">
                <Video className="h-12 w-12 mx-auto mb-4" />
                <p>No video recording available for this session.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
