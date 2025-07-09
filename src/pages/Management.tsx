import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  Building2, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight,
  Mail,
  Phone,
  Calendar,
  User,
  Network,
  TreePine,
  CreditCard
} from 'lucide-react';
import { EmployeeDetailsDialog } from '@/components/hrms/EmployeeDetailsDialog';

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  date_of_joining: string;
  salary: number;
  status: string;
  user_id?: string;
  hierarchy_level?: number;
  reports_to?: string;
  has_payment_rights?: boolean;
}

interface DepartmentGroup {
  department: string;
  employees: Employee[];
  count: number;
}

export default function Management() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set(['Finance']));
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['management_employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *,
          departments!inner(name, icon),
          positions(title)
        `)
        .not('user_id', 'is', null) // Only get employees who have user accounts (actual working employees)
        .order('hierarchy_level', { ascending: true })
        .order('department', { ascending: true })
        .order('designation', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as (Employee & { departments: { name: string; icon: string }; positions: { title: string } | null })[];
    },
  });

  // Fetch available positions for organizational structure
  const { data: availablePositions = [] } = useQuery({
    queryKey: ['available_positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select(`
          *,
          departments!inner(name, icon, hierarchy_level)
        `)
        .eq('is_active', true)
        .order('hierarchy_level', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'INACTIVE': return 'bg-red-100 text-red-800';
      case 'ON_LEAVE': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDepartmentIcon = (department: string) => {
    switch (department) {
      case 'Board': return '📋';
      case 'Executive': return '🎯';
      case 'Finance': return '💰';
      case 'Operations': return '⚙️';
      case 'Compliance': return '⚖️';
      default: return '🏢';
    }
  };

  const getHierarchyIcon = (level: number) => {
    switch (level) {
      case 1: return '👑';
      case 2: return '🎯';
      case 3: return '💼';
      case 4: return '📊';
      case 5: return '👤';
      default: return '🏢';
    }
  };

  const buildHierarchy = (employees: Employee[]) => {
    const hierarchy: any = {};
    const roots: Employee[] = [];

    // Build the hierarchy tree
    employees.forEach(emp => {
      if (!emp.reports_to || emp.hierarchy_level === 1) {
        roots.push(emp);
      } else {
        const parent = employees.find(e => e.id === emp.reports_to);
        if (parent) {
          if (!hierarchy[parent.id]) {
            hierarchy[parent.id] = [];
          }
          hierarchy[parent.id].push(emp);
        }
      }
    });

    return { hierarchy, roots };
  };

  const { hierarchy, roots } = buildHierarchy(employees);

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || emp.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  const departmentGroups: DepartmentGroup[] = filteredEmployees.reduce((acc, emp) => {
    const existing = acc.find(g => g.department === emp.department);
    if (existing) {
      existing.employees.push(emp);
      existing.count++;
    } else {
      acc.push({
        department: emp.department,
        employees: [emp],
        count: 1
      });
    }
    return acc;
  }, [] as DepartmentGroup[]);

  const departments = [...new Set(employees.map(emp => emp.department))];

  const toggleDepartment = (department: string) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(department)) {
      newExpanded.delete(department);
    } else {
      newExpanded.add(department);
    }
    setExpandedDepartments(newExpanded);
  };

  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const renderEmployeeCard = (employee: Employee, isDirectReport = false) => (
    <div 
      key={employee.id}
      className={`border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-300 ${
        isDirectReport ? 'bg-blue-50 border-blue-200' : 'bg-white'
      }`}
      onClick={() => handleEmployeeClick(employee)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback className={`text-white font-medium ${
            employee.hierarchy_level === 1 ? 'bg-purple-600' :
            employee.hierarchy_level === 2 ? 'bg-blue-600' :
            employee.hierarchy_level === 3 ? 'bg-green-600' :
            'bg-gray-600'
          }`}>
            {getInitials(employee.name)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-gray-900 truncate">{employee.name}</h4>
              <p className="text-sm text-gray-600 truncate">{employee.designation}</p>
              <p className="text-xs text-gray-500">{employee.employee_id}</p>
            </div>
            <div className="flex items-center gap-1">
              {employee.has_payment_rights && (
                <div title="Has payment rights">
                  <CreditCard className="h-4 w-4 text-green-500" />
                </div>
              )}
              {employee.user_id && (
                <div title="Has user account">
                  <User className="h-4 w-4 text-blue-500" />
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Mail className="h-3 w-3" />
              <span className="truncate">{employee.email}</span>
            </div>
            {employee.phone && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Phone className="h-3 w-3" />
                <span>{employee.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Calendar className="h-3 w-3" />
              <span>Joined {new Date(employee.date_of_joining).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className="mt-3 flex items-center justify-between">
            <Badge className={getStatusColor(employee.status)}>
              {employee.status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Level {employee.hierarchy_level}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHierarchyLevel = (employees: Employee[], level: number, parentId?: string) => (
    <div className="space-y-4">
      {employees
        .filter(emp => emp.hierarchy_level === level && 
          (level === 1 ? !emp.reports_to : emp.reports_to === parentId))
        .map(employee => (
          <div key={employee.id} className="space-y-3">
            {renderEmployeeCard(employee)}
            {hierarchy[employee.id] && hierarchy[employee.id].length > 0 && (
              <div className="ml-8 space-y-3 border-l-2 border-gray-200 pl-6">
                {hierarchy[employee.id].map((subordinate: Employee) => (
                  <div key={subordinate.id} className="space-y-3">
                    {renderEmployeeCard(subordinate, true)}
                    {hierarchy[subordinate.id] && hierarchy[subordinate.id].length > 0 && (
                      <div className="ml-8 space-y-3 border-l-2 border-gray-100 pl-6">
                        {hierarchy[subordinate.id].map((subEmployee: Employee) => 
                          renderEmployeeCard(subEmployee, false)
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );

  // Function to render position cards (not employee cards)
  const renderPositionCard = (position: any, isOccupied = false) => (
    <div 
      key={position.id}
      className={`border rounded-lg p-4 transition-all ${
        isOccupied ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center">
          <span className="text-2xl">{position.departments.icon}</span>
        </div>
        <h4 className="font-medium text-gray-900 mb-1">{position.title}</h4>
        <p className="text-sm text-gray-600 mb-2">{position.departments.name}</p>
        <Badge variant={isOccupied ? "default" : "secondary"} className="text-xs">
          {isOccupied ? "Occupied" : "Available"}
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Network className="h-8 w-8 text-slate-600" />
            </div>
            Management Structure
          </h1>
          <p className="text-gray-600 mt-2">
            Organizational hierarchy showing available positions and working employees
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            <Building2 className="h-4 w-4 mr-1" />
            5 Departments
          </Badge>
          <Badge variant="outline" className="text-sm">
            <Users className="h-4 w-4 mr-1" />
            {employees.length} Working Employees
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="hierarchy" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hierarchy" className="flex items-center gap-2">
            <TreePine className="h-4 w-4" />
            Organizational Hierarchy
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Department View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Search Employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search employees by name, ID, email, or designation..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <TreePine className="h-6 w-6 text-green-600" />
                Blynk Virtual Technologies - Organizational Structure
              </CardTitle>
              <p className="text-gray-600">Available positions and roles in the organization</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-12">
                {/* Board Level */}
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center justify-center gap-2">
                    📋 Board of Directors
                  </h3>
                  <div className="flex justify-center">
                    {availablePositions
                      .filter(pos => pos.departments.hierarchy_level === 1)
                      .map(position => renderPositionCard(position, false))}
                  </div>
                </div>

                {/* Connection Line */}
                <div className="flex justify-center">
                  <div className="w-px h-12 bg-gray-300"></div>
                </div>

                {/* Executive Level */}
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center justify-center gap-2">
                    🎯 Executive Management
                  </h3>
                  <div className="flex justify-center">
                    {availablePositions
                      .filter(pos => pos.departments.hierarchy_level === 2)
                      .map(position => renderPositionCard(position, false))}
                  </div>
                </div>

                {/* Connection Line */}
                <div className="flex justify-center">
                  <div className="w-px h-12 bg-gray-300"></div>
                </div>

                {/* Department Level */}
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-8 flex items-center justify-center gap-2">
                    🏢 Department Heads & Staff
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {['Finance', 'Operations', 'Compliance'].map(deptName => {
                      const deptPositions = availablePositions.filter(
                        pos => pos.departments.name === deptName
                      );
                      
                      return (
                        <div key={deptName} className="space-y-6">
                          <h4 className="text-lg font-semibold text-gray-800 flex items-center justify-center gap-2">
                            {getDepartmentIcon(deptName)} {deptName}
                          </h4>
                          
                          <div className="space-y-4">
                            {/* Manager Level */}
                            {deptPositions
                              .filter(pos => pos.hierarchy_level === 3)
                              .map(position => (
                                <div key={position.id}>
                                  {renderPositionCard(position, false)}
                                </div>
                              ))}
                            
                            {/* Executive Level */}
                            <div className="flex justify-center">
                              <div className="w-px h-6 bg-gray-200"></div>
                            </div>
                            
                            <div className="space-y-3">
                              {deptPositions
                                .filter(pos => pos.hierarchy_level === 4)
                                .map(position => (
                                  <div key={position.id} className="scale-95">
                                    {renderPositionCard(position, false)}
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search employees by name, ID, email, or designation..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>
                        {getDepartmentIcon(dept)} {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Department Tree */}
          <div className="space-y-4">
            {departmentGroups.map(group => (
              <Card key={group.department} className="overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleDepartment(group.department)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedDepartments.has(group.department) ? 
                        <ChevronDown className="h-5 w-5 text-gray-500" /> : 
                        <ChevronRight className="h-5 w-5 text-gray-500" />
                      }
                      <div className="text-2xl">{getDepartmentIcon(group.department)}</div>
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{group.department}</h3>
                        <p className="text-sm text-gray-600">{group.count} employees</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {group.count}
                    </Badge>
                  </div>
                </CardHeader>
                
                {expandedDepartments.has(group.department) && (
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.employees.map(employee => renderEmployeeCard(employee))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          {departmentGroups.length === 0 && (
            <Card>
              <CardContent className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No employees found</h3>
                <p className="text-gray-600">Try adjusting your search criteria or filters.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <EmployeeDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={selectedEmployee}
        isEditMode={false}
      />
    </div>
  );
}