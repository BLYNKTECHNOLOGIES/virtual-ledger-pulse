
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  designation: string;
  department: string;
  salary: number;
}

interface PayslipRecord {
  id: string;
  employee_id: string;
  month_year: string;
  basic_salary: number;
  hra: number;
  conveyance_allowance: number;
  medical_allowance: number;
  other_allowances: number;
  gross_wages: number;
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
  status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  employees: Employee;
}

export function SalaryPayoutTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch payslips with proper type casting
  const { data: payslips, isLoading } = useQuery({
    queryKey: ['payslips_with_employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select(`
          *,
          employees (
            id,
            name,
            employee_id,
            designation,
            department,
            salary
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as PayslipRecord[]) || [];
    },
  });

  // Update payment status mutation
  const updatePaymentStatusMutation = useMutation({
    mutationFn: async ({ payslipId, status }: { payslipId: string; status: string }) => {
      const { error } = await supabase
        .from('payslips')
        .update({ 
          payment_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', payslipId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment status updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['payslips_with_employees'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment status",
        variant: "destructive",
      });
    },
  });

  const handlePaySalary = (payslipId: string) => {
    updatePaymentStatusMutation.mutate({ payslipId, status: 'PAID' });
  };

  const pendingPayslips = payslips?.filter(p => p.payment_status === 'PENDING') || [];
  const paidPayslips = payslips?.filter(p => p.payment_status === 'PAID') || [];

  const totalPaidAmount = paidPayslips.reduce((sum, payslip) => sum + payslip.net_salary, 0);
  const totalEmployees = payslips?.length || 0;
  const totalDeductions = paidPayslips.reduce((sum, payslip) => sum + payslip.total_deductions, 0);
  const currentMonth = format(new Date(), 'MMMM yyyy');

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Salary Payout</h2>
          <p className="text-gray-600">Manage salary payments and view salary register</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Total Paid Salary</div>
            <div className="text-2xl font-bold">₹{totalPaidAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Total Employees</div>
            <div className="text-2xl font-bold">{totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Total Deductions</div>
            <div className="text-2xl font-bold">₹{totalDeductions.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Current Month</div>
            <div className="text-2xl font-bold">{currentMonth}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Pending and Paid Salaries */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">
            Pending Salaries ({pendingPayslips.length})
          </TabsTrigger>
          <TabsTrigger value="paid">
            Paid Salaries ({paidPayslips.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Salary Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading payslips...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Month/Year</TableHead>
                      <TableHead>Net Salary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayslips.map((payslip) => (
                      <TableRow key={payslip.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{payslip.employees.name}</div>
                            <div className="text-sm text-gray-500">{payslip.employees.employee_id}</div>
                          </div>
                        </TableCell>
                        <TableCell>{payslip.month_year}</TableCell>
                        <TableCell className="font-medium">₹{payslip.net_salary.toLocaleString()}</TableCell>
                        <TableCell>{getPaymentStatusBadge(payslip.payment_status)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handlePaySalary(payslip.id)}
                            disabled={updatePaymentStatusMutation.isPending}
                          >
                            Pay Salary
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingPayslips.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          No pending salary payments found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card>
            <CardHeader>
              <CardTitle>Paid Salaries</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading payslips...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Month/Year</TableHead>
                      <TableHead>Net Salary</TableHead>
                      <TableHead>Paid Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidPayslips.map((payslip) => (
                      <TableRow key={payslip.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{payslip.employees.name}</div>
                            <div className="text-sm text-gray-500">{payslip.employees.employee_id}</div>
                          </div>
                        </TableCell>
                        <TableCell>{payslip.month_year}</TableCell>
                        <TableCell className="font-medium">₹{payslip.net_salary.toLocaleString()}</TableCell>
                        <TableCell>{format(new Date(payslip.updated_at), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{getPaymentStatusBadge(payslip.payment_status)}</TableCell>
                      </TableRow>
                    ))}
                    {paidPayslips.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          No paid salaries found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
