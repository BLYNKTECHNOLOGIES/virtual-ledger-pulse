
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Eye, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { KYCDetailsDialog } from "./KYCDetailsDialog";

const mockPendingKYC = [
  {
    id: "1",
    counterpartyName: "John Doe",
    orderAmount: 50000,
    purposeOfBuying: "Investment",
    createdAt: "2024-01-15",
    requestedBy: "Agent Smith",
    hasAadharFront: true,
    hasAadharBack: true,
    hasVerifiedFeedback: true,
    hasNegativeFeedback: false,
  },
  {
    id: "2",
    counterpartyName: "Jane Smith", 
    orderAmount: 75000,
    purposeOfBuying: "Personal Use",
    createdAt: "2024-01-16",
    requestedBy: "Agent Johnson",
    hasAadharFront: true,
    hasAadharBack: true,
    hasVerifiedFeedback: false,
    hasNegativeFeedback: true,
  },
];

export function PendingKYCTab() {
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<any>(null);

  const handleViewDetails = (kyc: any) => {
    setSelectedKYC(kyc);
    setDetailsDialogOpen(true);
  };

  const handleApprove = (kycId: string) => {
    console.log("Approving KYC:", kycId);
    // Handle approval logic
  };

  const handleReject = (kycId: string) => {
    console.log("Rejecting KYC:", kycId);
    // Handle rejection logic
  };

  const handleQuery = (kycId: string) => {
    console.log("Raising query for KYC:", kycId);
    // Handle query logic
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {mockPendingKYC.map((kyc) => (
          <Card key={kyc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <Badge variant="secondary">PENDING</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Order Amount</p>
                  <p className="font-medium">₹{kyc.orderAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Purpose</p>
                  <p className="font-medium">{kyc.purposeOfBuying}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Requested Date</p>
                  <p className="font-medium">{kyc.createdAt}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Requested By</p>
                  <p className="font-medium">{kyc.requestedBy}</p>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                {kyc.hasAadharFront && <Badge variant="outline" className="text-green-600">Aadhar Front</Badge>}
                {kyc.hasAadharBack && <Badge variant="outline" className="text-green-600">Aadhar Back</Badge>}
                {kyc.hasVerifiedFeedback && <Badge variant="outline" className="text-green-600">Verified Feedback</Badge>}
                {kyc.hasNegativeFeedback && <Badge variant="outline" className="text-red-600">Negative Feedback</Badge>}
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleViewDetails(kyc)} className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  View Details
                </Button>
                <Button size="sm" onClick={() => handleApprove(kyc.id)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleReject(kyc.id)} className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleQuery(kyc.id)} className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Query
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <KYCDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        kycRequest={selectedKYC}
      />
    </div>
  );
}
