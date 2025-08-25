import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  Calendar, 
  Clock,
  Award,
  BookOpen,
  FileText,
  TrendingUp,
  Building,
  Mail,
  Phone,
  MapPin,
  Eye,
  Edit,
  Plus,
  Search,
  Filter,
  Download,
  BarChart3,
  Target,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ComprehensiveAddEmployeeDialog } from "@/components/ems/ComprehensiveAddEmployeeDialog";

export default function EMS() {
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);

  // Fetch employees data
  const { data: employeesData, isLoading } = useQuery({
    queryKey: ['employees_data'],
    queryFn: async () => {
      const { data: employees } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: payslips } = await supabase
        .from('payslips')
        .select('employee_id, net_salary, month_year')
        .order('created_at', { ascending: false });

      // Get department counts
      const departmentCounts = employees?.reduce((acc, emp) => {
        acc[emp.department] = (acc[emp.department] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Get status counts
      const statusCounts = employees?.reduce((acc, emp) => {
        acc[emp.status] = (acc[emp.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      return {
        employees: employees || [],
        payslips: payslips || [],
        departmentCounts,
        statusCounts,
        totalEmployees: employees?.length || 0,
        activeEmployees: employees?.filter(emp => emp.status === 'ACTIVE').length || 0
      };
    },
  });

  // Filter employees based on search and filters
  const filteredEmployees = employeesData?.employees.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.employee_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = departmentFilter === "all" || employee.department === departmentFilter;
    const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  }) || [];

  const getDepartments = () => {
    return [...new Set(employeesData?.employees.map(emp => emp.department) || [])];
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-100 text-emerald-800';
      case 'INACTIVE': return 'bg-red-100 text-red-800';
      case 'ON_LEAVE': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Section - Simple and Clean */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Users className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Employee Management System</h1>
                <p className="text-sm text-gray-600">Analytics-driven workforce management using comprehensive data methodology</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>Current Month</option>
                <option>Last Month</option>
                <option>Quarter</option>
              </select>
              <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>All Departments</option>
                {getDepartments().map(dept => (
                  <option key={dept}>{dept}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="text-sm"
                onClick={() => setAddEmployeeOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
              <Button size="sm" variant="outline" className="text-sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Summary */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-5 gap-8 border-b pb-8">
            <div>
              <div className="text-sm text-gray-600 mb-1">Total Employees</div>
              <div className="text-3xl font-bold text-gray-900">
                ₹ {(employeesData?.totalEmployees || 0).toLocaleString()}.00
              </div>
              <div className="text-xs text-gray-500">Headcount</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Active Employees</div>
              <div className="text-3xl font-bold text-gray-900">
                ₹ {(employeesData?.activeEmployees || 0).toLocaleString()}.00
              </div>
              <div className="text-xs text-gray-500">Active workforce</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Total Payroll</div>
              <div className="text-3xl font-bold text-gray-900">
                ₹ {(employeesData?.employees.reduce((sum, emp) => sum + (emp.salary || 0), 0) || 0).toLocaleString()}.00
              </div>
              <div className="text-xs text-gray-500">Monthly disbursements</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Departments</div>
              <div className="text-3xl font-bold text-gray-900">
                {Object.keys(employeesData?.departmentCounts || {}).length}.00
              </div>
              <div className="text-xs text-gray-500">Department units</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Net Onboarding</div>
              <div className="text-3xl font-bold text-gray-900">
                ₹ {(employeesData?.employees.filter(emp => 
                  new Date(emp.created_at).getMonth() === new Date().getMonth()
                ).length || 0).toLocaleString()}.00
              </div>
              <div className="text-xs text-gray-500">117.0% growth</div>
            </div>
          </div>
        </div>
      </div>

      {/* Department-wise Employee Analysis */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">📊 Department-wise Employee Analysis</h3>
            <p className="text-sm text-gray-600">Every employee mapped with department performance using comprehensive methodology</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="text-left py-3 px-4 font-medium">Department</th>
                  <th className="text-left py-3 px-4 font-medium">Headcount</th>
                  <th className="text-left py-3 px-4 font-medium">Type</th>
                  <th className="text-left py-3 px-4 font-medium">Active %</th>
                  <th className="text-left py-3 px-4 font-medium">Avg Salary (₹)</th>
                  <th className="text-left py-3 px-4 font-medium">Total Cost (₹)</th>
                  <th className="text-left py-3 px-4 font-medium">Efficiency</th>
                  <th className="text-left py-3 px-4 font-medium">Growth Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(employeesData?.departmentCounts || {}).map(([department, count]) => {
                  const deptEmployees = employeesData?.employees.filter(emp => emp.department === department) || [];
                  const activeCount = deptEmployees.filter(emp => emp.status === 'ACTIVE').length;
                  const avgSalary = deptEmployees.reduce((sum, emp) => sum + (emp.salary || 0), 0) / deptEmployees.length || 0;
                  const totalCost = deptEmployees.reduce((sum, emp) => sum + (emp.salary || 0), 0);
                  
                  return (
                    <tr key={department} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{department}</td>
                      <td className="py-3 px-4">{count}</td>
                      <td className="py-3 px-4">Full-time</td>
                      <td className="py-3 px-4">{activeCount > 0 ? Math.round((activeCount / count) * 100) : 0}%</td>
                      <td className="py-3 px-4">₹{avgSalary.toLocaleString()}</td>
                      <td className="py-3 px-4">₹{totalCost.toLocaleString()}</td>
                      <td className="py-3 px-4">-</td>
                      <td className="py-3 px-4">-</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Employee Performance Details */}
      <div className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">⏱️ Employee Performance Tracking</h3>
            <p className="text-sm text-gray-600">Transparency view showing how each employee maps to specific performance metrics</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="text-left py-3 px-4 font-medium">Employee ID</th>
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Department</th>
                  <th className="text-left py-3 px-4 font-medium">Join Date</th>
                  <th className="text-left py-3 px-4 font-medium">Salary (₹)</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Performance Score</th>
                  <th className="text-left py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.slice(0, 10).map((employee) => (
                  <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-blue-600">{employee.employee_id}</td>
                    <td className="py-3 px-4">{employee.name}</td>
                    <td className="py-3 px-4">{employee.department}</td>
                    <td className="py-3 px-4">{format(new Date(employee.date_of_joining), 'dd MMM yyyy')}</td>
                    <td className="py-3 px-4">₹{(employee.salary || 0).toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(employee.status)}`}>
                        {employee.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">-</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payroll & Benefits Breakdown */}
      <div className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">💰 Payroll & Benefits Breakdown</h3>
            <p className="text-sm text-gray-600">Detailed view of operational expenses and additional income streams</p>
          </div>
          
          <div className="grid grid-cols-4 gap-8">
            <div>
              <div className="text-sm text-gray-600 mb-1">Base Salary</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.basic_salary || 0), 0) || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Monthly base pay</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Allowances</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.allowances || 0), 0) || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Additional benefits</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Incentives</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.incentives || 0), 0) || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Performance bonuses</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Deductions</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.deductions || 0), 0) || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Tax & PF deductions</div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Employee Dialog */}
      <ComprehensiveAddEmployeeDialog 
        open={addEmployeeOpen} 
        onOpenChange={setAddEmployeeOpen} 
      />
    </div>
  );
}