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

export default function EMS() {
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white rounded-xl mb-6">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-700 rounded-xl shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Employee Management System
                  </h1>
                  <p className="text-blue-200 text-lg">
                    Comprehensive employee lifecycle management
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-2 border-blue-400 text-blue-600 hover:bg-blue-50 shadow-md"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Data
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-2 border-blue-400 text-blue-600 hover:bg-blue-50 shadow-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-blue-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-blue-100 text-sm font-medium">Total Employees</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {employeesData?.totalEmployees || 0}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">All Departments</span>
                </div>
              </div>
              <div className="bg-blue-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <Users className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-emerald-100 text-sm font-medium">Active Employees</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {employeesData?.activeEmployees || 0}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Currently Working</span>
                </div>
              </div>
              <div className="bg-emerald-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <UserCheck className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-purple-100 text-sm font-medium">Departments</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {Object.keys(employeesData?.departmentCounts || {}).length}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <Building className="h-4 w-4" />
                  <span className="text-sm font-medium">Active Departments</span>
                </div>
              </div>
              <div className="bg-purple-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <Building className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-indigo-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-indigo-100 text-sm font-medium">This Month Onboarding</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {employeesData?.employees.filter(emp => 
                    new Date(emp.created_at).getMonth() === new Date().getMonth()
                  ).length || 0}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <UserPlus className="h-4 w-4" />
                  <span className="text-sm font-medium">New Joiners</span>
                </div>
              </div>
              <div className="bg-indigo-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <UserPlus className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* EMS Tabs */}
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-6">
          {/* Search and Filter Bar */}
          <Card className="bg-white border-2 border-gray-200 shadow-lg">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search employees by name, email, or ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {getDepartments().map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Employee List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading employees...</p>
              </div>
            ) : filteredEmployees.length > 0 ? (
              filteredEmployees.map((employee) => (
                <Card key={employee.id} className="bg-white border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{employee.name}</CardTitle>
                        <p className="text-blue-200 text-sm">{employee.designation}</p>
                      </div>
                      <Badge className={getStatusBadgeColor(employee.status)}>
                        {employee.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Building className="h-4 w-4 text-gray-500" />
                        <span>{employee.department}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-gray-500" />
                        <span className="truncate">{employee.email}</span>
                      </div>
                      {employee.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-gray-500" />
                          <span>{employee.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span>Joined: {format(new Date(employee.date_of_joining), 'MMM dd, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Target className="h-4 w-4 text-gray-500" />
                        <span>ID: {employee.employee_id}</span>
                      </div>
                      <div className="pt-3 border-t flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1">
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500">
                <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No employees found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="departments" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(employeesData?.departmentCounts || {}).map(([department, count]) => (
              <Card key={department} className="bg-white border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-lg">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building className="h-5 w-5" />
                    {department}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-indigo-600 mb-2">{count}</div>
                    <p className="text-sm text-gray-600 mb-4">Total Employees</p>
                    <Button size="sm" variant="outline" className="w-full">
                      <Eye className="h-4 w-4 mr-2" />
                      View Department
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-2 border-gray-200 shadow-xl">
              <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-green-700 rounded-lg shadow-md">
                    <Award className="h-6 w-6" />
                  </div>
                  Performance Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Excellent Performance</span>
                    <Badge className="bg-green-100 text-green-800">25%</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Good Performance</span>
                    <Badge className="bg-blue-100 text-blue-800">60%</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Needs Improvement</span>
                    <Badge className="bg-yellow-100 text-yellow-800">15%</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200 shadow-xl">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-blue-700 rounded-lg shadow-md">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  <Award className="h-4 w-4 mr-2" />
                  Schedule Performance Review
                </Button>
                <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Performance Reports
                </Button>
                <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50">
                  <Target className="h-4 w-4 mr-2" />
                  Set Goals & Objectives
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-6">
          <Card className="bg-white border-2 border-gray-200 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-orange-700 rounded-lg shadow-md">
                  <Clock className="h-6 w-6" />
                </div>
                Attendance Management
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-green-600">85%</div>
                  <p className="text-sm text-gray-600">Present Today</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-yellow-600">10%</div>
                  <p className="text-sm text-gray-600">On Leave</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <Clock className="h-8 w-8 text-red-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-red-600">5%</div>
                  <p className="text-sm text-gray-600">Absent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Employee Report</h3>
                <p className="text-sm text-gray-600 mb-4">Comprehensive employee data</p>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Attendance Report</h3>
                <p className="text-sm text-gray-600 mb-4">Detailed attendance analysis</p>
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Award className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Performance Report</h3>
                <p className="text-sm text-gray-600 mb-4">Employee performance metrics</p>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}