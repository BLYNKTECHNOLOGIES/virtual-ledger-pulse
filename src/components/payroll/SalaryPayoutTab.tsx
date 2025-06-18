
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, DollarSign, Download, CreditCard, CheckCircle, Clock } from "lucide-react";
import { PayslipGenerationDialog } from "./PayslipGenerationDialog";
import { generatePayslipPDF, PayslipData } from "@/utils/payslipPdfGenerator";
import { useToast } from "@/hooks/use-toast";

interface PayslipRecord {
  id: string;
  employee_id: string;
  month_year: string;
  basic_salary: number;
  hra: number;
  conveyance_allowance: number;
  medical_allowance: number;
  other_allowances: number;
  total_earnings: number;
  epf: number;
  esi: number;
  professional_tax: number;
  total_deductions: number;
  net_salary: number;
  total_working_days: number;
  leaves_taken: number;
  lop_days: number;
  paid_days: number;
  gross_wages: number;
  created_at: string;
  payment_status?: string;
  employees?: {
    name: string;
    employee_id: string;
    designation: string;
    department: string;
    date_of_joining: string;
  };
}

export function SalaryPayoutTab() {
  const [showPayslipDialog, setShowPayslipDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch payslips from database
  const { data: payslips } = useQuery({
    queryKey: ['payslips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select(`
          *,
          employees!employee_id(name, employee_id, designation, department, date_of_joining)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PayslipRecord[];
    },
  });

  // Mark salary as paid mutation
  const markSalaryPaidMutation = useMutation({
    mutationFn: async (payslipId: string) => {
      const { error } = await supabase
        .from('payslips')
        .update({ payment_status: 'PAID' })
        .eq('id', payslipId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Salary marked as paid successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Separate pending and paid salaries
  const pendingSalaries = payslips?.filter(payslip => payslip.payment_status !== 'PAID') || [];
  const paidSalaries = payslips?.filter(payslip => payslip.payment_status === 'PAID') || [];

  // Calculate totals for salary register
  const totalPaidAmount = paidSalaries.reduce((sum, payslip) => sum + (payslip.net_salary || 0), 0);
  const totalEmployees = payslips?.length || 0;
  const totalDeductions = paidSalaries.reduce((sum, payslip) => sum + (payslip.total_deductions || 0), 0);

  const handleDownloadPayslip = (payslip: PayslipRecord) => {
    const payslipData: PayslipData = {
      employee: {
        id: payslip.employee_id,
        name: payslip.employees?.name || '',
        employee_id: payslip.employees?.employee_id || '',
        designation: payslip.employees?.designation || '',
        department: payslip.employees?.department || '',
        date_of_joining: payslip.employees?.date_of_joining || '',
      },
      payslip: {
        month_year: payslip.month_year,
        basic_salary: payslip.basic_salary,
        hra: payslip.hra,
        conveyance_allowance: payslip.conveyance_allowance,
        medical_allowance: payslip.medical_allowance,
        other_allowances: payslip.other_allowances,
        total_earnings: payslip.total_earnings,
        epf: payslip.epf,
        esi: payslip.esi,
        professional_tax: payslip.professional_tax,
        total_deductions: payslip.total_deductions,
        net_salary: payslip.net_salary,
        total_working_days: payslip.total_working_days,
        leaves_taken: payslip.leaves_taken,
        lop_days: payslip.lop_days,
        paid_days: payslip.paid_days,
        gross_wages: payslip.gross_wages,
      },
    };

    generatePayslipPDF(payslipData);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Salary
          </TabsTrigger>
          <TabsTrigger value="paid" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Salaries Paid
          </TabsTrigger>
          <TabsTrigger value="register">Salary Register</TabsTrigger>
          <TabsTrigger value="summary">Salary Summary</TabsTrigger>
          <TabsTrigger value="adjustments">Salary Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Pending Salaries
                </CardTitle>
                <Button onClick={() => setShowPayslipDialog(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Payslips
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingSalaries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No pending salaries found
                  </div>
                ) : (
                  pendingSalaries.map((payslip) => (
                    <div key={payslip.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-semibold">{payslip.employees?.name}</h3>
                        <p className="text-sm text-gray-600">{payslip.month_year}</p>
                        <p className="text-sm text-gray-500">
                          Net Salary: ₹{payslip.net_salary?.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          Employee ID: {payslip.employees?.employee_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">Pending</Badge>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadPayslip(payslip)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => markSalaryPaidMutation.mutate(payslip.id)}
                          disabled={markSalaryPaidMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark Paid
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Paid Salaries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {paidSalaries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No paid salaries found
                  </div>
                ) : (
                  paidSalaries.map((payslip) => (
                    <div key={payslip.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-semibold">{payslip.employees?.name}</h3>
                        <p className="text-sm text-gray-600">{payslip.month_year}</p>
                        <p className="text-sm text-gray-500">
                          Net Salary: ₹{payslip.net_salary?.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          Employee ID: {payslip.employees?.employee_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default">Paid</Badge>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadPayslip(payslip)}
                        >
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
                    <div className="text-2xl font-bold text-green-600">₹{totalPaidAmount.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Total Paid</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{totalEmployees}</div>
                    <div className="text-sm text-gray-600">Employees</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">₹{totalDeductions.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Total Deductions</div>
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
