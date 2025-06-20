
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Eye, Calendar } from "lucide-react";
import { KYCDetailsDialog } from "./KYCDetailsDialog";
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
  updated_at: string;
}

export function AcceptedKYCTab() {
  const [kycRequests, setKycRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<KYCRequest | null>(null);
  const { toast } = useToast();

  const fetchApprovedKYC = async () => {
    try {
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('status', 'APPROVED')
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      setKycRequests(data || []);
    } catch (error) {
      console.error('Error fetching approved KYC requests:', error);
      toast({
        title: "Error",
        description: "Failed to fetch approved KYC requests.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovedKYC();
  }, []);

  const handleViewDetails = (kyc: KYCRequest) => {
    setSelectedKYC(kyc);
    setDetailsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading approved KYC requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Approved KYC Requests</h3>
        <div className="text-sm text-gray-500">
          Total Approved: {kycRequests.length}
        </div>
      </div>

      {kycRequests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No approved KYC requests found.</p>
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
                  </CardTitle>
                  <Badge className="bg-green-100 text-green-800">APPROVED</Badge>
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
                    <p className="text-sm font-medium text-gray-500">Approved Date</p>
                    <p className="font-medium">{new Date(kyc.updated_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  {kyc.aadhar_front_url && <Badge variant="outline" className="text-green-600">Aadhar Front</Badge>}
                  {kyc.aadhar_back_url && <Badge variant="outline" className="text-green-600">Aadhar Back</Badge>}
                  <Badge variant="outline" className="text-blue-600">Binance ID</Badge>
                  {kyc.verified_feedback_url && <Badge variant="outline" className="text-green-600">Verified Feedback</Badge>}
                  {kyc.negative_feedback_url && <Badge variant="outline" className="text-red-600">Negative Feedback</Badge>}
                  {kyc.additional_documents_url && <Badge variant="outline" className="text-purple-600">Additional Docs</Badge>}
                </div>

                {kyc.additional_info && (
                  <div className="mb-4 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                    <p className="text-sm font-medium text-blue-800">Additional Info:</p>
                    <p className="text-sm text-blue-700">{kyc.additional_info}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleViewDetails(kyc)} className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    View Details
                  </Button>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    View Timeline
                  </Button>
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
