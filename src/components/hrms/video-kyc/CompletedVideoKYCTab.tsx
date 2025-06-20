
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, User, Video, Calendar, FileText } from "lucide-react";

const mockCompletedVideoKYC = [
  {
    id: "1",
    counterpartyName: "Alice Johnson",
    kycRequestId: "KYC-003",
    orderAmount: 100000,
    completedDate: "2024-01-18 02:30 PM",
    conductedBy: "Officer Smith",
    videoUrl: "https://example.com/video1",
    notes: "KYC completed successfully. All documents verified.",
    status: "COMPLETED",
  },
  {
    id: "2",
    counterpartyName: "Bob Wilson",
    kycRequestId: "KYC-004",
    orderAmount: 80000,
    completedDate: "2024-01-17 11:15 AM",
    conductedBy: "Officer Johnson",
    videoUrl: "https://example.com/video2",
    notes: "Additional verification required for address proof.",
    status: "COMPLETED",
  },
];

export function CompletedVideoKYCTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {mockCompletedVideoKYC.map((kyc) => (
          <Card key={kyc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {kyc.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">KYC Request ID</p>
                  <p className="font-medium">{kyc.kycRequestId}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Order Amount</p>
                  <p className="font-medium">₹{kyc.orderAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Completed Date</p>
                  <p className="font-medium">{kyc.completedDate}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Conducted By</p>
                  <p className="font-medium">{kyc.conductedBy}</p>
                </div>
              </div>
              
              {kyc.notes && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-500 mb-1">Notes</p>
                  <p className="text-sm bg-gray-50 p-2 rounded">{kyc.notes}</p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
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
    </div>
  );
}
