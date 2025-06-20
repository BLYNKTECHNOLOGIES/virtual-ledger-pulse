
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Video } from "lucide-react";
import { ScheduleVideoKYCDialog } from "./ScheduleVideoKYCDialog";

const mockNewVideoKYC = [
  {
    id: "1",
    counterpartyName: "John Doe",
    kycRequestId: "KYC-001",
    orderAmount: 50000,
    status: "NEW",
    createdAt: "2024-01-15",
  },
  {
    id: "2",
    counterpartyName: "Jane Smith",
    kycRequestId: "KYC-002",
    orderAmount: 75000,
    status: "SCHEDULED",
    scheduledDate: "2024-01-20 10:00 AM",
    createdAt: "2024-01-16",
  },
];

export function NewVideoKYCTab() {
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedKYC, setSelectedKYC] = useState<any>(null);

  const handleSchedule = (kyc: any) => {
    setSelectedKYC(kyc);
    setScheduleDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {mockNewVideoKYC.map((kyc) => (
          <Card key={kyc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {kyc.counterpartyName}
                </CardTitle>
                <Badge variant={kyc.status === "NEW" ? "secondary" : "outline"}>
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
                  <p className="text-sm font-medium text-gray-500">Created Date</p>
                  <p className="font-medium">{kyc.createdAt}</p>
                </div>
                {kyc.scheduledDate && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Scheduled</p>
                    <p className="font-medium">{kyc.scheduledDate}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {kyc.status === "NEW" && (
                  <Button onClick={() => handleSchedule(kyc)} className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Schedule Video KYC
                  </Button>
                )}
                {kyc.status === "SCHEDULED" && (
                  <Button variant="outline" className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Start Video KYC
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ScheduleVideoKYCDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        kycRequest={selectedKYC}
      />
    </div>
  );
}
