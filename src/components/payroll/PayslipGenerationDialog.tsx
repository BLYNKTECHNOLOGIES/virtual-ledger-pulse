
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Calculator, Building2 } from "lucide-react";

interface PayslipGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayslipGenerationDialog({ open, onOpenChange }: PayslipGenerationDialogProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [payslipData, setPayslipData] = useState({
    basic_salary: 0,
    hra: 0,
    conveyance_allowance: 0,
    medical_allowance: 0,
    other_allowances: 0,
    epf: 0,
    esi: 0,
    professional_tax: 0,
    total_working_days: 30,
    leaves_taken: 0,
    lop_days: 0,
  });

  const queryClient = useQueryClient();

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ['employees_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Get selected employee
  const selectedEmployee = employees?.find(emp => emp.id === selectedEmployeeId);

  // Calculate derived values
  const paidDays = payslipData.total_working_days - payslipData.lop_days;
  const grossWages = Math.round((selectedEmployee?.salary || 0) * (paidDays / payslipData.total_working_days));
  const totalEarnings = payslipData.basic_salary + payslipData.hra + payslipData.conveyance_allowance + payslipData.medical_allowance + payslipData.other_allowances;
  const totalDeductions = payslipData.epf + payslipData.esi + payslipData.professional_tax;
  const netSalary = totalEarnings - totalDeductions;

  // Generate payslip mutation
  const generatePayslipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmployeeId) throw new Error('Please select an employee');
      
      // Check if payslip already exists for this month
      const { data: existingPayslip } = await supabase
        .from('payslips')
        .select('id')
        .eq('employee_id', selectedEmployeeId)
        .eq('month_year', monthYear)
        .single();

      if (existingPayslip) {
        throw new Error('Payslip already exists for this employee and month');
      }

      const { error } = await supabase
        .from('payslips')
        .insert({
          employee_id: selectedEmployeeId,
          month_year: monthYear,
          basic_salary: payslipData.basic_salary,
          hra: payslipData.hra,
          conveyance_allowance: payslipData.conveyance_allowance,
          medical_allowance: payslipData.medical_allowance,
          other_allowances: payslipData.other_allowances,
          gross_wages: grossWages,
          total_earnings: totalEarnings,
          epf: payslipData.epf,
          esi: payslipData.esi,
          professional_tax: payslipData.professional_tax,
          total_deductions: totalDeductions,
          net_salary: netSalary,
          total_working_days: payslipData.total_working_days,
          leaves_taken: payslipData.leaves_taken,
          lop_days: payslipData.lop_days,
          paid_days: paidDays,
          status: 'GENERATED'
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Payslip generated successfully');
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setSelectedEmployeeId("");
    setPayslipData({
      basic_salary: 0,
      hra: 0,
      conveyance_allowance: 0,
      medical_allowance: 0,
      other_allowances: 0,
      epf: 0,
      esi: 0,
      professional_tax: 0,
      total_working_days: 30,
      leaves_taken: 0,
      lop_days: 0,
    });
  };

  // Auto-calculate components when employee is selected
  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const employee = employees?.find(emp => emp.id === employeeId);
    if (employee) {
      const salary = employee.salary;
      // Basic calculation breakdown (you can customize these percentages)
      const basic = Math.round(salary * 0.5); // 50% basic
      const hra = Math.round(salary * 0.2); // 20% HRA
      const conveyance = 1600; // Fixed amount
      const medical = 1250; // Fixed amount
      const other = salary - basic - hra - conveyance - medical;
      
      // Deductions calculation
      const epf = Math.round(basic * 0.12); // 12% of basic
      const esi = Math.round(salary * 0.0075); // 0.75% of gross
      const pt = salary > 10000 ? 200 : 0; // Professional tax

      setPayslipData({
        basic_salary: basic,
        hra: hra,
        conveyance_allowance: conveyance,
        medical_allowance: medical,
        other_allowances: other,
        epf: epf,
        esi: esi,
        professional_tax: pt,
        total_working_days: 30,
        leaves_taken: 0,
        lop_days: 0,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Generate Payslip
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Employee Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee">Select Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={handleEmployeeSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} - {employee.employee_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="month">Month/Year</Label>
              <Input
                type="month"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
              />
            </div>
          </div>

          {selectedEmployee && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  <div>
                    <CardTitle>Company Name</CardTitle>
                    <p className="text-sm text-gray-600">Company Address</p>
                    <p className="text-sm text-gray-600">Pay Slip for {new Date(monthYear).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Employee Details */}
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Employee ID:</span>
                      <span>{selectedEmployee.employee_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Employee Name:</span>
                      <span>{selectedEmployee.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Designation:</span>
                      <span>{selectedEmployee.designation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Department:</span>
                      <span>{selectedEmployee.department}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date of Joining:</span>
                      <span>{new Date(selectedEmployee.date_of_joining).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>UAN:</span>
                      <span>-</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PF No.:</span>
                      <span>-</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ESI No.:</span>
                      <span>-</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bank:</span>
                      <span>-</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Account No.:</span>
                      <span>-</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Working Days */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Gross Wages</Label>
                    <div className="text-center p-2 bg-gray-50 rounded">₹{grossWages}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Total Working Days</Label>
                    <Input
                      type="number"
                      value={payslipData.total_working_days}
                      onChange={(e) => setPayslipData(prev => ({ ...prev, total_working_days: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Leaves</Label>
                    <Input
                      type="number"
                      value={payslipData.leaves_taken}
                      onChange={(e) => setPayslipData(prev => ({ ...prev, leaves_taken: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>LOP Days</Label>
                    <Input
                      type="number"
                      value={payslipData.lop_days}
                      onChange={(e) => setPayslipData(prev => ({ ...prev, lop_days: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div className="text-center">
                  <span className="font-medium">Paid Days: {paidDays}</span>
                </div>

                <Separator />

                {/* Earnings and Deductions Table */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2 text-center">Earnings</h4>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell>Basic</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.basic_salary}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, basic_salary: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>HRA</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.hra}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, hra: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Conveyance Allowance</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.conveyance_allowance}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, conveyance_allowance: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Medical Allowance</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.medical_allowance}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, medical_allowance: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Other Allowances</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.other_allowances}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, other_allowances: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow className="font-medium">
                          <TableCell>Total Earnings</TableCell>
                          <TableCell>₹{totalEarnings}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2 text-center">Deductions</h4>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell>EPF</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.epf}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, epf: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>ESI</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.esi}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, esi: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Professional Tax</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={payslipData.professional_tax}
                              onChange={(e) => setPayslipData(prev => ({ ...prev, professional_tax: parseFloat(e.target.value) || 0 }))}
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="font-medium">
                          <TableCell>Total Deductions</TableCell>
                          <TableCell>₹{totalDeductions}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="text-center py-4 bg-blue-50 rounded">
                  <span className="text-lg font-bold">Net Salary: ₹{netSalary}</span>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => generatePayslipMutation.mutate()}
                    disabled={!selectedEmployeeId || generatePayslipMutation.isPending}
                  >
                    {generatePayslipMutation.isPending ? 'Generating...' : 'Generate Payslip'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
