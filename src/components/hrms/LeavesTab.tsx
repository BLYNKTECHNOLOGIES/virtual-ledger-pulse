
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, FileText, BarChart3 } from "lucide-react";

export function LeavesTab() {
  const [leaveRequests] = useState([
    { id: 1, employee: "Ravi Sharma", type: "Sick Leave", days: 2, status: "Approved", startDate: "2025-06-18" },
    { id: 2, employee: "Priya Singh", type: "Vacation", days: 5, status: "Pending", startDate: "2025-06-25" },
    { id: 3, employee: "Amit Kumar", type: "Casual Leave", days: 1, status: "Rejected", startDate: "2025-06-16" },
  ]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="applications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="applications">Leave Applications</TabsTrigger>
          <TabsTrigger value="approval">Leave Approval</TabsTrigger>
          <TabsTrigger value="balances">Leave Balances</TabsTrigger>
          <TabsTrigger value="history">Leave History</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Leave Applications
                </CardTitle>
                <Button>
                  <Calendar className="h-4 w-4 mr-2" />
                  Apply for Leave
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {leaveRequests.map((leave) => (
                  <div key={leave.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold">{leave.employee}</h3>
                      <p className="text-sm text-gray-600">{leave.type} - {leave.days} day(s)</p>
                      <p className="text-sm text-gray-500">From: {leave.startDate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        leave.status === "Approved" ? "default" : 
                        leave.status === "Rejected" ? "destructive" : "secondary"
                      }>
                        {leave.status}
                      </Badge>
                      <Button variant="outline" size="sm">View Details</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approval">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Leave Approval Process
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">Pending Approvals</h3>
                    <Badge variant="secondary">1 Pending</Badge>
                  </div>
                  <p className="text-sm text-gray-600">Priya Singh - Vacation Leave (5 days)</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="default">Approve</Button>
                    <Button size="sm" variant="outline">Reject</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Leave Balances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">12</div>
                  <div className="text-sm text-gray-600">Vacation Days</div>
                  <div className="text-xs text-gray-500">Remaining</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">8</div>
                  <div className="text-sm text-gray-600">Sick Leave</div>
                  <div className="text-xs text-gray-500">Remaining</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">5</div>
                  <div className="text-sm text-gray-600">Casual Leave</div>
                  <div className="text-xs text-gray-500">Remaining</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Leave History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No leave history available</p>
                <Button className="mt-4">View Full History</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
