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
  Crown,
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
        .select('*')
        .order('hierarchy_level', { ascending: true })
        .order('department', { ascending: true })
        .order('designation', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Employee[];
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
      case 'Board': return '👑';
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
            employee.hierarchy_level === 1 ? 'bg-gradient-to-br from-purple-600 to-purple-700' :
            employee.hierarchy_level === 2 ? 'bg-gradient-to-br from-blue-600 to-blue-700' :
            employee.hierarchy_level === 3 ? 'bg-gradient-to-br from-green-600 to-green-700' :
            'bg-gradient-to-br from-gray-600 to-gray-700'
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
                  <Crown className="h-4 w-4 text-yellow-500" />
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
            Organizational hierarchy and employee management overview
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            <Building2 className="h-4 w-4 mr-1" />
            {departments.length} Departments
          </Badge>
          <Badge variant="outline" className="text-sm">
            <Users className="h-4 w-4 mr-1" />
            {employees.length} Employees
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
                Organizational Hierarchy Structure
              </CardTitle>
              <p className="text-gray-600">Complete organizational structure with reporting relationships</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[800px] space-y-8">
                {/* Level 1 - Board of Directors */}
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-center gap-2">
                    👑 Board of Directors
                  </h3>
                  <div className="flex justify-center gap-6">
                    {employees.filter(emp => emp.hierarchy_level === 1).map(director => (
                      <div key={director.id} className="w-64">
                        {renderEmployeeCard(director)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connector Line */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gray-300"></div>
                </div>

                {/* Level 2 - General Manager */}
                {employees.filter(emp => emp.hierarchy_level === 2).map(gm => (
                  <div key={gm.id} className="text-center">
                    <div className="flex justify-center mb-6">
                      <div className="w-64">
                        {renderEmployeeCard(gm)}
                      </div>
                    </div>

                    {/* Connector Line */}
                    <div className="flex justify-center mb-6">
                      <div className="w-px h-8 bg-gray-300"></div>
                    </div>

                    {/* Level 3 - Department Heads - Fixed Layout */}
                    <div className="flex justify-center">
                      <div className="grid grid-cols-3 gap-12 max-w-6xl">
                        {['Finance', 'Operations', 'Compliance'].map(dept => {
                          const deptHead = employees.find(emp => 
                            emp.hierarchy_level === 3 && emp.department === dept
                          );
                          
                          if (!deptHead) return (
                            <div key={dept} className="w-80 space-y-4">
                              <h4 className="text-lg font-semibold text-gray-400 flex items-center justify-center gap-2">
                                {getDepartmentIcon(dept)} {dept}
                              </h4>
                              <div className="text-center text-gray-400 p-4 border-2 border-dashed border-gray-200 rounded-lg">
                                No department head assigned
                              </div>
                            </div>
                          );

                          return (
                            <div key={dept} className="w-80 space-y-4">
                              <h4 className="text-lg font-semibold text-gray-900 flex items-center justify-center gap-2">
                                {getDepartmentIcon(dept)} {dept}
                              </h4>
                              
                              {/* Department Head */}
                              <div className="flex justify-center">
                                <div className="w-full">
                                  {renderEmployeeCard(deptHead)}
                                </div>
                              </div>

                              {/* Subordinates */}
                              {hierarchy[deptHead.id] && hierarchy[deptHead.id].length > 0 && (
                                <div className="space-y-3">
                                  <div className="flex justify-center">
                                    <div className="w-px h-6 bg-gray-200"></div>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    {hierarchy[deptHead.id].map((subordinate: Employee) => (
                                      <div key={subordinate.id} className="space-y-3">
                                        {renderEmployeeCard(subordinate, true)}
                                        
                                        {/* Further subordinates */}
                                        {hierarchy[subordinate.id] && hierarchy[subordinate.id].length > 0 && (
                                          <div className="ml-4 space-y-2 border-l-2 border-gray-100 pl-4">
                                            {hierarchy[subordinate.id].map((emp: Employee) => (
                                              <div key={emp.id} className="transform scale-95">
                                                {renderEmployeeCard(emp, false)}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
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