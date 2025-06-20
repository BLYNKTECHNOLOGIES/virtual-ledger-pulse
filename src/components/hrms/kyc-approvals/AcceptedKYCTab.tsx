
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, User, Eye, FileText } from "lucide-react";

const mockAcceptedKYC = [
  {
    id: "1",
    counterpartyName: "Emma Watson",
    orderAmount: 85000,
    approvedAt: "2024-01-16",
    reviewedBy: "Compliance Officer",
    originalRequestDate: "2024-01-14",
    completedVideoKYC: true,
  },
  {
    id: "2",
    counterpartyName: "Michael Johnson",
    orderAmount: 120000,
    approvedAt: "2024-01-15",
    reviewedBy: "Senior Compliance Officer", 
    originalRequestDate: "2024-01-12",
    completedVideoKYC: false,
  },
];

export function AcceptedKYCTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {mockAcceptedKYC.map((kyc) => (
          <Card key={kyc.id} className="border-green-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    APPROVED
                  </Badge>
                  {kyc.completedVideoKYC && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      Video KYC Done
                    </Badge>
                  )}
                </div>
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
                  <p className="text-sm font-medium text-gray-500">Approved Date</p>
                  <p className="font-medium">{kyc.approvedAt}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Approved By</p>
                  <p className="font-medium">{kyc.reviewedBy}</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  View Details
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Download Certificate
                </Button>
                {kyc.completedVideoKYC && (
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    View Video KYC
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
