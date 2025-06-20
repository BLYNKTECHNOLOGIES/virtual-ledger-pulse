
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Eye, AlertCircle, RotateCcw } from "lucide-react";

const mockRejectedKYC = [
  {
    id: "1",
    counterpartyName: "Robert Wilson",
    orderAmount: 35000,
    purposeOfBuying: "Personal Investment",
    createdAt: "2024-01-14",
    rejectedAt: "2024-01-16",
    requestedBy: "Agent Taylor",
    rejectedBy: "Compliance Officer C",
    rejectionReason: "Incomplete documentation - Aadhar images are not clear and readable",
    hasAadharFront: true,
    hasAadharBack: true,
    hasVerifiedFeedback: false,
    hasNegativeFeedback: true,
  },
  {
    id: "2",
    counterpartyName: "Emma Thompson",
    orderAmount: 92000,
    purposeOfBuying: "Property Investment",
    createdAt: "2024-01-12",
    rejectedAt: "2024-01-13",
    requestedBy: "Agent Martinez",
    rejectedBy: "Compliance Officer A",
    rejectionReason: "High-risk profile detected based on negative feedback screenshots",
    hasAadharFront: true,
    hasAadharBack: true,
    hasVerifiedFeedback: true,
    hasNegativeFeedback: true,
  },
];

export function RejectedKYCTab() {
  const handleResubmit = (kycId: string) => {
    console.log("Resubmitting KYC:", kycId);
    // Handle resubmission logic
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Rejected KYC Requests</h3>
        <div className="text-sm text-gray-500">
          Total Rejected: {mockRejectedKYC.length}
        </div>
      </div>

      <div className="grid gap-4">
        {mockRejectedKYC.map((kyc) => (
          <Card key={kyc.id} className="border-red-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <Badge variant="destructive">REJECTED</Badge>
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
                  <p className="text-sm font-medium text-gray-500">Rejected Date</p>
                  <p className="font-medium">{kyc.rejectedAt}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Requested By</p>
                  <p className="font-medium">{kyc.requestedBy}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Rejected By</p>
                  <p className="font-medium">{kyc.rejectedBy}</p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-red-50 rounded border-l-4 border-red-400">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
                    <p className="text-sm text-red-700">{kyc.rejectionReason}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mb-4 flex-wrap">
                {kyc.hasAadharFront && <Badge variant="outline" className="text-green-600">Aadhar Front</Badge>}
                {kyc.hasAadharBack && <Badge variant="outline" className="text-green-600">Aadhar Back</Badge>}
                {kyc.hasVerifiedFeedback && <Badge variant="outline" className="text-green-600">Verified Feedback</Badge>}
                {kyc.hasNegativeFeedback &&  <Badge variant="outline" className="text-red-600">Negative Feedback</Badge>}
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  View Details
                </Button>
                <Button size="sm" onClick={() => handleResubmit(kyc.id)} className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Resubmit Request
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
