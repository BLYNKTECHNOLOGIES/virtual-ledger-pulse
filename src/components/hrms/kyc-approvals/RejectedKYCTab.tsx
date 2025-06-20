
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XCircle, User, Eye, RotateCcw } from "lucide-react";

const mockRejectedKYC = [
  {
    id: "1",
    counterpartyName: "Charlie Brown",
    orderAmount: 45000,
    rejectionReason: "Incomplete documentation - Aadhar back image unclear",
    rejectedAt: "2024-01-12",
    reviewedBy: "Compliance Officer",
    originalRequestDate: "2024-01-10",
  },
  {
    id: "2",
    counterpartyName: "Diana Prince",
    orderAmount: 60000,
    rejectionReason: "Negative feedback screenshots indicate fraudulent activity",
    rejectedAt: "2024-01-11",
    reviewedBy: "Senior Compliance Officer",
    originalRequestDate: "2024-01-08",
  },
];

export function RejectedKYCTab() {
  const handleReconsider = (kycId: string) => {
    console.log("Reconsidering KYC:", kycId);
    // Handle reconsideration logic
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {mockRejectedKYC.map((kyc) => (
          <Card key={kyc.id} className="border-red-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  REJECTED
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Order Amount</p>
                  <p className="font-medium">₹{kyc.orderAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Original Request</p>
                  <p className="font-medium">{kyc.originalRequestDate}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Rejected Date</p>
                  <p className="font-medium">{kyc.rejectedAt}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Reviewed By</p>
                  <p className="font-medium">{kyc.reviewedBy}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500 mb-1">Rejection Reason</p>
                <p className="text-sm bg-red-50 p-2 rounded border-l-4 border-red-400">
                  {kyc.rejectionReason}
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  View Details
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleReconsider(kyc.id)} className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reconsider
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
