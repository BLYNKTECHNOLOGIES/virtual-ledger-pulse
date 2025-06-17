
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface PayslipGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PayslipData {
  employee_id: string;
  month_year: string;
  basic_salary: number;
  hra: number;
  conveyance_allowance: number;
  medical_allowance: number;
  other_allowances: number;
  epf: number;
  esi: number;
  professional_tax: number;
  total_working_days: number;
  leaves_taken: number;
  lop_days: number;
  paid_days: number;
  gross_wages: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
}

export function PayslipGenerationDialog({ open, onOpenChange }: PayslipGenerationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [monthYear, setMonthYear] = useState("");
  const [payslipData, setPayslipData] = useState<Partial<PayslipData>>({
    total_working_days: 30,
    leaves_taken: 0,
    lop_days: 0,
    paid_days: 30,
  });

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

  // Calculate derived values
  const calculateValues = () => {
    const basic = payslipData.basic_salary || 0;
    const hra = payslipData.hra || 0;
    const conveyance = payslipData.conveyance_allowance || 0;
    const medical = payslipData.medical_allowance || 0;
    const other = payslipData.other_allowances || 0;
    
    const totalEarnings = basic + hra + conveyance + medical + other;
    
    const epf = payslipData.epf || 0;
    const esi = payslipData.esi || 0;
    const professionalTax = payslipData.professional_tax || 0;
    
    const totalDeductions = epf + esi + professionalTax;
    const netSalary = totalEarnings - totalDeductions;
    
    return {
      totalEarnings,
      totalDeductions,
      netSalary,
      grossWages: basic // Assuming gross wages equals basic for this example
    };
  };

  const { totalEarnings, totalDeductions, netSalary, grossWages } = calculateValues();

  // Handle employee selection
  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployee(employeeId);
    const employee = employees?.find(emp => emp.id === employeeId);
    if (employee) {
      // Pre-fill basic salary from employee record
      setPayslipData(prev => ({
        ...prev,
        basic_salary: employee.salary || 0,
        hra: (employee.salary || 0) * 0.4, // 40% of basic as HRA
        conveyance_allowance: 1600,
        medical_allowance: 1250,
        other_allowances: 1650,
        epf: (employee.salary || 0) * 0.12, // 12% EPF
        esi: Math.min((employee.salary || 0) * 0.0075, 113), // 0.75% ESI, max 113
        professional_tax: 0
      }));
    }
  };

  const generatePayslipMutation = useMutation({
    mutationFn: async (data: PayslipData) => {
      const { error } = await supabase
        .from('payslips')
        .insert({
          ...data,
          total_earnings: totalEarnings,
          total_deductions: totalDeductions,
          net_salary: netSalary,
          gross_wages: grossWages,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payslip generated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to generate payslip: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedEmployee("");
    setMonthYear("");
    setPayslipData({
      total_working_days: 30,
      leaves_taken: 0,
      lop_days: 0,
      paid_days: 30,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEmployee || !monthYear) {
      toast({
        title: "Error",
        description: "Please select employee and month/year.",
        variant: "destructive",
      });
      return;
    }

    const finalData: PayslipData = {
      employee_id: selectedEmployee,
      month_year: monthYear,
      basic_salary: payslipData.basic_salary || 0,
      hra: payslipData.hra || 0,
      conveyance_allowance: payslipData.conveyance_allowance || 0,
      medical_allowance: payslipData.medical_allowance || 0,
      other_allowances: payslipData.other_allowances || 0,
      epf: payslipData.epf || 0,
      esi: payslipData.esi || 0,
      professional_tax: payslipData.professional_tax || 0,
      total_working_days: payslipData.total_working_days || 30,
      leaves_taken: payslipData.leaves_taken || 0,
      lop_days: payslipData.lop_days || 0,
      paid_days: payslipData.paid_days || 30,
      gross_wages: grossWages,
      total_earnings: totalEarnings,
      total_deductions: totalDeductions,
      net_salary: netSalary,
    };

    generatePayslipMutation.mutate(finalData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Payslip</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="employee">Select Employee *</Label>
              <Select onValueChange={handleEmployeeSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} ({employee.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="month_year">Month & Year *</Label>
              <Input
                id="month_year"
                type="month"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Attendance Details */}
          <div className="space-y-4 border rounded-lg p-4">
            <h3 className="text-lg font-semibold">Attendance Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="total_working_days">Total Working Days</Label>
                <Input
                  id="total_working_days"
                  type="number"
                  value={payslipData.total_working_days}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, total_working_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="leaves_taken">Leaves</Label>
                <Input
                  id="leaves_taken"
                  type="number"
                  value={payslipData.leaves_taken}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, leaves_taken: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="lop_days">LOP Days</Label>
                <Input
                  id="lop_days"
                  type="number"
                  value={payslipData.lop_days}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, lop_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="paid_days">Paid Days</Label>
                <Input
                  id="paid_days"
                  type="number"
                  value={payslipData.paid_days}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, paid_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          {/* Earnings */}
          <div className="space-y-4 border rounded-lg p-4">
            <h3 className="text-lg font-semibold">Earnings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="basic_salary">Basic Salary</Label>
                <Input
                  id="basic_salary"
                  type="number"
                  value={payslipData.basic_salary}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, basic_salary: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="hra">HRA</Label>
                <Input
                  id="hra"
                  type="number"
                  value={payslipData.hra}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, hra: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="conveyance_allowance">Conveyance Allowance</Label>
                <Input
                  id="conveyance_allowance"
                  type="number"
                  value={payslipData.conveyance_allowance}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, conveyance_allowance: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="medical_allowance">Medical Allowance</Label>
                <Input
                  id="medical_allowance"
                  type="number"
                  value={payslipData.medical_allowance}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, medical_allowance: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="other_allowances">Other Allowances</Label>
                <Input
                  id="other_allowances"
                  type="number"
                  value={payslipData.other_allowances}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, other_allowances: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total Earnings:</span>
                <span>₹{totalEarnings.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="space-y-4 border rounded-lg p-4">
            <h3 className="text-lg font-semibold">Deductions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="epf">EPF</Label>
                <Input
                  id="epf"
                  type="number"
                  value={payslipData.epf}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, epf: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="esi">ESI</Label>
                <Input
                  id="esi"
                  type="number"
                  value={payslipData.esi}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, esi: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="professional_tax">Professional Tax</Label>
                <Input
                  id="professional_tax"
                  type="number"
                  value={payslipData.professional_tax}
                  onChange={(e) => setPayslipData(prev => ({ ...prev, professional_tax: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total Deductions:</span>
                <span>₹{totalDeductions.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Net Salary */}
          <div className="space-y-4 border rounded-lg p-4 bg-green-50">
            <div className="flex justify-between text-xl font-bold text-green-800">
              <span>Net Salary:</span>
              <span>₹{netSalary.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={generatePayslipMutation.isPending}>
              {generatePayslipMutation.isPending ? "Generating..." : "Generate Payslip"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
