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
    <div className="min-h-screen bg-background">
      {/* Hero Header Section */}
      <section className="relative bg-gradient-to-r from-primary via-primary/90 to-blue-700 text-white py-20">
        <div className="absolute inset-0 bg-black bg-opacity-10"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                <Users className="h-12 w-12" />
              </div>
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Employee Management System
            </h1>
            <p className="text-xl lg:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              Comprehensive employee lifecycle management for modern businesses
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-gray-100 px-8 py-4 text-lg rounded-full"
              >
                <Download className="h-5 w-5 mr-2" />
                Export Data
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-primary px-8 py-4 text-lg rounded-full"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Employee
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Key Metrics Section */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-6">Key Metrics</h2>
            <p className="text-xl text-muted-foreground">Real-time insights into your workforce</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-primary to-blue-700 text-white">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-white/80 text-sm font-medium mb-2">Total Employees</p>
                    <p className="text-4xl font-bold mb-4">
                      {employeesData?.totalEmployees || 0}
                    </p>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">All Departments</span>
                    </div>
                  </div>
                  <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                    <Users className="h-10 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-green-600 to-emerald-700 text-white">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-white/80 text-sm font-medium mb-2">Active Employees</p>
                    <p className="text-4xl font-bold mb-4">
                      {employeesData?.activeEmployees || 0}
                    </p>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm">Currently Working</span>
                    </div>
                  </div>
                  <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                    <UserCheck className="h-10 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-white/80 text-sm font-medium mb-2">Departments</p>
                    <p className="text-4xl font-bold mb-4">
                      {Object.keys(employeesData?.departmentCounts || {}).length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      <span className="text-sm">Active Departments</span>
                    </div>
                  </div>
                  <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                    <Building className="h-10 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-orange-600 to-red-700 text-white">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-white/80 text-sm font-medium mb-2">This Month Onboarding</p>
                    <p className="text-4xl font-bold mb-4">
                      {employeesData?.employees.filter(emp => 
                        new Date(emp.created_at).getMonth() === new Date().getMonth()
                      ).length || 0}
                    </p>
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      <span className="text-sm">New Joiners</span>
                    </div>
                  </div>
                  <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                    <UserPlus className="h-10 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* EMS Tabs */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs defaultValue="employees" className="w-full">
            <div className="bg-white rounded-2xl shadow-lg border-0 overflow-hidden">
              <TabsList className="grid w-full grid-cols-5 bg-gray-100 rounded-none h-16">
                <TabsTrigger value="employees" className="text-lg font-medium">Employees</TabsTrigger>
                <TabsTrigger value="departments" className="text-lg font-medium">Departments</TabsTrigger>
                <TabsTrigger value="performance" className="text-lg font-medium">Performance</TabsTrigger>
                <TabsTrigger value="attendance" className="text-lg font-medium">Attendance</TabsTrigger>
                <TabsTrigger value="reports" className="text-lg font-medium">Reports</TabsTrigger>
              </TabsList>

            <TabsContent value="employees" className="p-8 space-y-8">
              {/* Search and Filter Bar */}
              <div className="bg-white rounded-xl border shadow-sm p-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
                      <Input
                        placeholder="Search employees by name, email, or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-12 h-12 text-lg border-2 border-gray-200 focus:border-primary"
                      />
                    </div>
                  </div>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="w-48 h-12 border-2 border-gray-200">
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
                    <SelectTrigger className="w-40 h-12 border-2 border-gray-200">
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
              </div>

              {/* Employee List */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {isLoading ? (
                  <div className="col-span-full text-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-muted-foreground text-lg">Loading employees...</p>
                  </div>
                ) : filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <Card key={employee.id} className="group hover:shadow-xl transition-all duration-300 border-0 bg-white shadow-lg">
                      <CardHeader className="bg-gradient-to-r from-primary to-blue-700 text-white rounded-t-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-xl">{employee.name}</CardTitle>
                            <p className="text-white/80 text-sm">{employee.designation}</p>
                          </div>
                          <Badge className={`${getStatusBadgeColor(employee.status)} font-medium`}>
                            {employee.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 text-sm">
                            <Building className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">{employee.department}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Mail className="h-5 w-5 text-muted-foreground" />
                            <span className="truncate">{employee.email}</span>
                          </div>
                          {employee.phone && (
                            <div className="flex items-center gap-3 text-sm">
                              <Phone className="h-5 w-5 text-muted-foreground" />
                              <span>{employee.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-sm">
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                            <span>Joined: {format(new Date(employee.date_of_joining), 'MMM dd, yyyy')}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Target className="h-5 w-5 text-muted-foreground" />
                            <span>ID: {employee.employee_id}</span>
                          </div>
                          <div className="pt-4 border-t flex gap-3">
                            <Button size="sm" variant="outline" className="flex-1 rounded-full">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            <Button size="sm" className="flex-1 rounded-full">
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full text-center py-16">
                    <Users className="h-20 w-20 mx-auto mb-6 text-muted-foreground opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">No employees found</h3>
                    <p className="text-muted-foreground">Try adjusting your search or filters</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="departments" className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {Object.entries(employeesData?.departmentCounts || {}).map(([department, count]) => (
                  <Card key={department} className="group hover:shadow-xl transition-all duration-300 border-0 bg-white shadow-lg">
                    <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white rounded-t-xl">
                      <CardTitle className="flex items-center gap-3 text-xl">
                        <Building className="h-6 w-6" />
                        {department}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-indigo-600 mb-3">{count}</div>
                        <p className="text-muted-foreground mb-6">Total Employees</p>
                        <Button size="lg" variant="outline" className="w-full rounded-full">
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
            </div>
          </Tabs>
        </div>
      </section>
    </div>
  );
}