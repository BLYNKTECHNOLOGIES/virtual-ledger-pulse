
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, DollarSign, Download, CreditCard } from "lucide-react";
import { PayslipGenerationDialog } from "./PayslipGenerationDialog";

export function SalaryPayoutTab() {
  const [showPayslipDialog, setShowPayslipDialog] = useState(false);

  // Fetch payslips from database
  const { data: payslips } = useQuery({
    queryKey: ['payslips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select(`
          *,
          employees!employee_id(name, employee_id)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Get recent payslips (last 10)
  const recentPayslips = payslips?.slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="payslips" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="register">Salary Register</TabsTrigger>
          <TabsTrigger value="summary">Salary Summary</TabsTrigger>
          <TabsTrigger value="adjustments">Salary Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="payslips">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Employee Payslips
                </CardTitle>
                <Button onClick={() => setShowPayslipDialog(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Payslips
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentPayslips.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No payslips generated yet
                  </div>
                ) : (
                  recentPayslips.map((payslip) => (
                    <div key={payslip.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-semibold">{payslip.employees?.name}</h3>
                        <p className="text-sm text-gray-600">{payslip.month_year}</p>
                        <p className="text-sm text-gray-500">
                          Gross: ₹{payslip.total_earnings?.toLocaleString()} | Net: ₹{payslip.net_salary?.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          Employee ID: {payslip.employees?.employee_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={payslip.status === "GENERATED" ? "default" : "secondary"}>
                          {payslip.status}
                        </Badge>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="register">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Salary Register
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">₹12,50,000</div>
                    <div className="text-sm text-gray-600">Total Paid</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">18</div>
                    <div className="text-sm text-gray-600">Employees</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">₹2,30,000</div>
                    <div className="text-sm text-gray-600">Deductions</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">June 2025</div>
                    <div className="text-sm text-gray-600">Current Month</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Salary Summary Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Generate salary summary reports</p>
                <Button className="mt-4">Generate Report</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Salary Adjustments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No salary adjustments this month</p>
                <Button className="mt-4">Make Adjustment</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayslipGenerationDialog 
        open={showPayslipDialog} 
        onOpenChange={setShowPayslipDialog} 
      />
    </div>
  );
}
