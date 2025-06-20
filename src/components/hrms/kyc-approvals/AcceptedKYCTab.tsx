
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Eye, Calendar } from "lucide-react";

const mockApprovedKYC = [
  {
    id: "1",
    counterpartyName: "Michael Johnson",
    orderAmount: 45000,
    purposeOfBuying: "Investment Portfolio",
    createdAt: "2024-01-10",
    approvedAt: "2024-01-12",
    requestedBy: "Agent Williams",
    approvedBy: "Compliance Officer A",
    hasAadharFront: true,
    hasAadharBack: true,
    hasVerifiedFeedback: true,
    hasNegativeFeedback: false,
  },
  {
    id: "2",
    counterpartyName: "Sarah Davis",
    orderAmount: 85000,
    purposeOfBuying: "Business Investment",
    createdAt: "2024-01-08",
    approvedAt: "2024-01-09",
    requestedBy: "Agent Brown",
    approvedBy: "Compliance Officer B",
    hasAadharFront: true,
    hasAadharBack: true,
    hasVerifiedFeedback: true,
    hasNegativeFeedback: false,
  },
];

export function AcceptedKYCTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Approved KYC Requests</h3>
        <div className="text-sm text-gray-500">
          Total Approved: {mockApprovedKYC.length}
        </div>
      </div>

      <div className="grid gap-4">
        {mockApprovedKYC.map((kyc) => (
          <Card key={kyc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <Badge className="bg-green-100 text-green-800">APPROVED</Badge>
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
                  <p className="text-sm font-medium text-gray-500">Approved Date</p>
                  <p className="font-medium">{kyc.approvedAt}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Requested By</p>
                  <p className="font-medium">{kyc.requestedBy}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Approved By</p>
                  <p className="font-medium">{kyc.approvedBy}</p>
                </div>
              </div>

              <div className="flex gap-2 mb-4 flex-wrap">
                {kyc.hasAadharFront && <Badge variant="outline" className="text-green-600">Aadhar Front</Badge>}
                {kyc.hasAadharBack && <Badge variant="outline" className="text-green-600">Aadhar Back</Badge>}
                {kyc.hasVerifiedFeedback && <Badge variant="outline" className="text-green-600">Verified Feedback</Badge>}
                {kyc.hasNegativeFeedback && <Badge variant="outline" className="text-red-600">Negative Feedback</Badge>}
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
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
    </div>
  );
}
