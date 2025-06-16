
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Upload, CheckCircle, XCircle } from "lucide-react";

export function ClaimExpenseTab() {
  const [expenses] = useState([
    { id: 1, employee: "Ravi Sharma", type: "Travel", amount: 2500, status: "Pending", date: "2025-06-15" },
    { id: 2, employee: "Priya Singh", type: "Meals", amount: 800, status: "Approved", date: "2025-06-14" },
    { id: 3, employee: "Amit Kumar", type: "Supplies", amount: 1200, status: "Rejected", date: "2025-06-13" },
  ]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="submissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="submissions">Expense Submissions</TabsTrigger>
          <TabsTrigger value="approval">Approval Process</TabsTrigger>
          <TabsTrigger value="reimbursement">Reimbursement</TabsTrigger>
          <TabsTrigger value="reports">Expense Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="submissions">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Expense Submissions
                </CardTitle>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Submit Expense
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold">{expense.employee}</h3>
                      <p className="text-sm text-gray-600">{expense.type} - ₹{expense.amount}</p>
                      <p className="text-sm text-gray-500">{expense.date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        expense.status === "Approved" ? "default" : 
                        expense.status === "Rejected" ? "destructive" : "secondary"
                      }>
                        {expense.status}
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
                <CheckCircle className="h-5 w-5" />
                Approval Process
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">Pending Approvals</h3>
                    <Badge variant="secondary">1 Pending</Badge>
                  </div>
                  <p className="text-sm text-gray-600">Ravi Sharma - Travel Expense ₹2,500</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="default">Approve</Button>
                    <Button size="sm" variant="outline">Reject</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reimbursement">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Reimbursement Processing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No pending reimbursements</p>
                <Button className="mt-4">Process Reimbursements</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Expense Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">₹45,000</div>
                  <div className="text-sm text-gray-600">This Month</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">₹38,000</div>
                  <div className="text-sm text-gray-600">Approved</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">₹5,000</div>
                  <div className="text-sm text-gray-600">Pending</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-red-600">₹2,000</div>
                  <div className="text-sm text-gray-600">Rejected</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
