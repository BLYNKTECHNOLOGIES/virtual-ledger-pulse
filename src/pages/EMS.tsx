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
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Users className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Employee Management System</h1>
                <p className="text-sm text-gray-600">Analytics-driven workforce management using comprehensive data methodology</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value="current-month">
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Current Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">Current Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                </SelectContent>
              </Select>
              <Select value="all-departments">
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-departments">All Departments</SelectItem>
                  {getDepartments().map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                onClick={() => setAddEmployeeOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Employee
              </Button>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Key Metrics Summary Cards */}
        <div className="grid grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <div className="text-sm text-blue-700 mb-1">Total Employees</div>
              <div className="text-2xl font-bold text-blue-900">
                {(employeesData?.totalEmployees || 0).toLocaleString()}
              </div>
              <div className="text-xs text-blue-600">Headcount</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="text-sm text-green-700 mb-1">Active Employees</div>
              <div className="text-2xl font-bold text-green-900">
                {(employeesData?.activeEmployees || 0).toLocaleString()}
              </div>
              <div className="text-xs text-green-600">Active workforce</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-4">
              <div className="text-sm text-purple-700 mb-1">Total Payroll</div>
              <div className="text-2xl font-bold text-purple-900">
                ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.salary || 0), 0) || 0).toLocaleString()}
              </div>
              <div className="text-xs text-purple-600">Monthly disbursements</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-4">
              <div className="text-sm text-orange-700 mb-1">Departments</div>
              <div className="text-2xl font-bold text-orange-900">
                {Object.keys(employeesData?.departmentCounts || {}).length}
              </div>
              <div className="text-xs text-orange-600">Department units</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
            <CardContent className="p-4">
              <div className="text-sm text-teal-700 mb-1">Net Onboarding</div>
              <div className="text-2xl font-bold text-teal-900">
                {(employeesData?.employees.filter(emp => 
                  new Date(emp.created_at).getMonth() === new Date().getMonth()
                ).length || 0).toLocaleString()}
              </div>
              <div className="text-xs text-teal-600">117.0% growth</div>
            </CardContent>
          </Card>
        </div>

        {/* Department-wise Employee Analysis */}
        <Card className="shadow-sm">
          <CardHeader className="bg-gray-50 border-b">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-gray-900">Department-wise Employee Analysis</CardTitle>
            </div>
            <p className="text-sm text-gray-600 mt-1">Every employee mapped with department performance using comprehensive methodology</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-700">
                    <th className="text-left py-3 px-4 font-semibold">Department</th>
                    <th className="text-left py-3 px-4 font-semibold">Headcount</th>
                    <th className="text-left py-3 px-4 font-semibold">Type</th>
                    <th className="text-left py-3 px-4 font-semibold">Active %</th>
                    <th className="text-left py-3 px-4 font-semibold">Avg Salary (₹)</th>
                    <th className="text-left py-3 px-4 font-semibold">Total Cost (₹)</th>
                    <th className="text-left py-3 px-4 font-semibold">Efficiency</th>
                    <th className="text-left py-3 px-4 font-semibold">Growth Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(employeesData?.departmentCounts || {}).map(([department, count]) => {
                    const deptEmployees = employeesData?.employees.filter(emp => emp.department === department) || [];
                    const activeCount = deptEmployees.filter(emp => emp.status === 'ACTIVE').length;
                    const avgSalary = deptEmployees.reduce((sum, emp) => sum + (emp.salary || 0), 0) / deptEmployees.length || 0;
                    const totalCost = deptEmployees.reduce((sum, emp) => sum + (emp.salary || 0), 0);
                    
                    return (
                      <tr key={department} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-900">{department}</td>
                        <td className="py-3 px-4 text-gray-700">{count}</td>
                        <td className="py-3 px-4 text-gray-700">Full-time</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            {activeCount > 0 ? Math.round((activeCount / count) * 100) : 0}%
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900">₹{avgSalary.toLocaleString()}</td>
                        <td className="py-3 px-4 font-medium text-gray-900">₹{totalCost.toLocaleString()}</td>
                        <td className="py-3 px-4 text-gray-500">-</td>
                        <td className="py-3 px-4 text-gray-500">-</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Employee Performance Details */}
        <Card className="shadow-sm">
          <CardHeader className="bg-gray-50 border-b">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-gray-900">Employee Performance Tracking</CardTitle>
            </div>
            <p className="text-sm text-gray-600 mt-1">Transparency view showing how each employee maps to specific performance metrics</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-700">
                    <th className="text-left py-3 px-4 font-semibold">Employee ID</th>
                    <th className="text-left py-3 px-4 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Department</th>
                    <th className="text-left py-3 px-4 font-semibold">Join Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Salary (₹)</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Performance Score</th>
                    <th className="text-left py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.slice(0, 10).map((employee) => (
                    <tr key={employee.id} className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-blue-600">{employee.employee_id}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">{employee.name}</td>
                      <td className="py-3 px-4 text-gray-700">{employee.department}</td>
                      <td className="py-3 px-4 text-gray-700">{format(new Date(employee.date_of_joining), 'dd MMM yyyy')}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">₹{(employee.salary || 0).toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(employee.status)}`}>
                          {employee.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500">-</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs hover:bg-blue-50">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs hover:bg-blue-50">
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Payroll & Benefits Breakdown */}
        <Card className="shadow-sm">
          <CardHeader className="bg-gray-50 border-b">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-green-600" />
              <CardTitle className="text-gray-900">Payroll & Benefits Breakdown</CardTitle>
            </div>
            <p className="text-sm text-gray-600 mt-1">Detailed view of operational expenses and additional income streams</p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-700 mb-2">Base Salary</div>
                <div className="text-2xl font-bold text-blue-900">
                  ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.basic_salary || 0), 0) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-blue-600">Monthly base pay</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                <div className="text-sm text-green-700 mb-2">Allowances</div>
                <div className="text-2xl font-bold text-green-900">
                  ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.allowances || 0), 0) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-green-600">Additional benefits</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                <div className="text-sm text-purple-700 mb-2">Incentives</div>
                <div className="text-2xl font-bold text-purple-900">
                  ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.incentives || 0), 0) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-purple-600">Performance bonuses</div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                <div className="text-sm text-orange-700 mb-2">Deductions</div>
                <div className="text-2xl font-bold text-orange-900">
                  ₹{(employeesData?.employees.reduce((sum, emp) => sum + (emp.deductions || 0), 0) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-orange-600">Tax & PF deductions</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Employee Dialog */}
      <ComprehensiveAddEmployeeDialog 
        open={addEmployeeOpen} 
        onOpenChange={setAddEmployeeOpen} 
      />
    </div>
  );
}