
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, FileText, Download, Plus, Eye } from "lucide-react";
import { PayslipGenerationDialog } from "@/components/payroll/PayslipGenerationDialog";
import { generatePayslipPDF } from "@/utils/payslipPdfGenerator";
import { toast } from "sonner";

export default function Payroll() {
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  // Fetch payslips
  const { data: payslips, refetch: refetchPayslips } = useQuery({
    queryKey: ['payslips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select(`
          *,
          employees (
            name,
            employee_id,
            designation,
            department
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const handleDownloadPayslip = async (payslip: any) => {
    try {
      console.log('Generating PDF for payslip:', payslip);
      await generatePayslipPDF(payslip, payslip.employees);
      toast.success('Payslip downloaded successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'GENERATED':
        return <Badge className="bg-blue-100 text-blue-800">Generated</Badge>;
      case 'PAID':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'FAILED':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Payroll Management System</h1>
        <p className="text-gray-600 mt-2">Employee compensation and payslip management</p>
      </div>

      <Tabs defaultValue="payslips" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payslips" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Payslip Management
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Compliance Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payslips" className="space-y-6">
          {/* Header Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Payslip Management</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Generate, manage and download employee payslips</p>
                </div>
                <Button 
                  onClick={() => setShowGenerateDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Payslip
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Payslips Table */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Payslips ({payslips?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {payslips && payslips.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Month/Year</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Gross Salary</TableHead>
                        <TableHead>Net Salary</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map((payslip) => (
                        <TableRow key={payslip.id}>
                          <TableCell className="font-medium">
                            {payslip.employees?.name}
                          </TableCell>
                          <TableCell>{payslip.employees?.employee_id}</TableCell>
                          <TableCell>
                            {new Date(payslip.month_year).toLocaleDateString('en-US', { 
                              month: 'long', 
                              year: 'numeric' 
                            })}
                          </TableCell>
                          <TableCell>{payslip.employees?.department}</TableCell>
                          <TableCell>₹{payslip.total_earnings?.toLocaleString()}</TableCell>
                          <TableCell className="font-semibold text-green-600">
                            ₹{payslip.net_salary?.toLocaleString()}
                          </TableCell>
                          <TableCell>{getStatusBadge(payslip.status)}</TableCell>
                          <TableCell>{getPaymentStatusBadge(payslip.payment_status || 'PENDING')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadPayslip(payslip)}
                                className="h-8"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No payslips generated yet</p>
                  <p className="text-sm">Click "Generate Payslip" to create your first payslip</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Reports</CardTitle>
              <p className="text-sm text-gray-600">Tax filings, statutory compliance and reporting</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-semibold">PF Returns</h3>
                        <p className="text-sm text-gray-600">Monthly PF compliance reports</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-green-600" />
                      <div>
                        <h3 className="font-semibold">ESI Returns</h3>
                        <p className="text-sm text-gray-600">ESI contribution reports</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-purple-600" />
                      <div>
                        <h3 className="font-semibold">TDS Reports</h3>
                        <p className="text-sm text-gray-600">Tax deduction statements</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-orange-600" />
                      <div>
                        <h3 className="font-semibold">Form 16</h3>
                        <p className="text-sm text-gray-600">Annual tax certificates</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-red-600" />
                      <div>
                        <h3 className="font-semibold">Professional Tax</h3>
                        <p className="text-sm text-gray-600">PT compliance reports</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-indigo-600" />
                      <div>
                        <h3 className="font-semibold">Bonus Reports</h3>
                        <p className="text-sm text-gray-600">Annual bonus calculations</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayslipGenerationDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
      />
    </div>
  );
}
