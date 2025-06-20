
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Eye, CheckCircle, XCircle, MessageSquare, Plus } from "lucide-react";
import { KYCDetailsDialog } from "./KYCDetailsDialog";
import { CreateKYCRequestDialog } from "./CreateKYCRequestDialog";
import { CreateQueryDialog } from "./CreateQueryDialog";

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
    additionalInfo: "Client has good transaction history",
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
    additionalInfo: "First time buyer, needs additional verification",
  },
];

export function PendingKYCTab() {
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [createRequestOpen, setCreateRequestOpen] = useState(false);
  const [createQueryOpen, setCreateQueryOpen] = useState(false);
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

  const handleQuery = (kyc: any) => {
    setSelectedKYC(kyc);
    setCreateQueryOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pending KYC Approvals</h3>
        <Button onClick={() => setCreateRequestOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Request
        </Button>
      </div>

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

              <div className="flex gap-2 mb-4 flex-wrap">
                {kyc.hasAadharFront && <Badge variant="outline" className="text-green-600">Aadhar Front</Badge>}
                {kyc.hasAadharBack && <Badge variant="outline" className="text-green-600">Aadhar Back</Badge>}
                {kyc.hasVerifiedFeedback && <Badge variant="outline" className="text-green-600">Verified Feedback</Badge>}
                {kyc.hasNegativeFeedback && <Badge variant="outline" className="text-red-600">Negative Feedback</Badge>}
              </div>

              {kyc.additionalInfo && (
                <div className="mb-4 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                  <p className="text-sm font-medium text-blue-800">Additional Info:</p>
                  <p className="text-sm text-blue-700">{kyc.additionalInfo}</p>
                </div>
              )}
              
              <div className="flex gap-2 flex-wrap">
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
                <Button variant="outline" size="sm" onClick={() => handleQuery(kyc)} className="flex items-center gap-2">
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

      <CreateKYCRequestDialog
        open={createRequestOpen}
        onOpenChange={setCreateRequestOpen}
      />

      <CreateQueryDialog
        open={createQueryOpen}
        onOpenChange={setCreateQueryOpen}
        kycRequest={selectedKYC}
      />
    </div>
  );
}
