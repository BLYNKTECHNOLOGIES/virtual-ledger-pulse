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

  const renderOrgChartBox = (employee: Employee, isTopLevel = false) => {
    const getBoxColor = (level: number) => {
      switch (level) {
        case 1: return 'bg-blue-600 text-white'; // Board
        case 2: return 'bg-red-400 text-white'; // General Manager
        case 3: return 'bg-teal-500 text-white'; // Department Heads
        case 4: return 'bg-purple-400 text-white'; // Managers
        default: return 'bg-gray-200 text-gray-800'; // Others
      }
    };

    const getIcon = (department: string, level: number) => {
      if (level === 1) return '⭐';
      if (level === 2) return '⭐';
      switch (department) {
        case 'Finance': return '💰';
        case 'Operations': return '⚙️';
        case 'Compliance': return '⚖️';
        default: return '🏢';
      }
    };

    return (
      <div 
        className={`rounded-lg p-4 shadow-md cursor-pointer hover:shadow-lg transition-all ${getBoxColor(employee.hierarchy_level || 5)} ${
          isTopLevel ? 'min-w-[280px]' : 'min-w-[220px]'
        }`}
        onClick={() => handleEmployeeClick(employee)}
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">
            {getIcon(employee.department, employee.hierarchy_level || 5)}
          </div>
          <div className="flex-1">
            <h3 className={`font-bold ${isTopLevel ? 'text-lg' : 'text-sm'}`}>
              {employee.name}
            </h3>
            <p className={`${isTopLevel ? 'text-base' : 'text-xs'} opacity-90`}>
              {employee.designation}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderConnectorLine = (width = 'w-px', height = 'h-8') => (
    <div className={`${width} ${height} bg-gray-400`}></div>
  );

  const renderHorizontalLine = (width = 'w-32') => (
    <div className={`${width} h-px bg-gray-400`}></div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-black text-white py-6">
        <div className="container mx-auto px-6">
          <h1 className="text-3xl font-bold text-center">
            Management Organizational Chart
          </h1>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="container mx-auto px-6 py-4">
        <div className="flex gap-4 items-center mb-6">
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
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Organizational Chart */}
      <div className="container mx-auto px-6 pb-12">
        <div className="bg-white rounded-lg shadow-lg p-8 overflow-x-auto">
          <div className="min-w-[1200px] space-y-12">
            {/* Level 1 - Board of Directors */}
            <div className="flex justify-center">
              <div className="flex items-end gap-8">
                {employees.filter(emp => emp.hierarchy_level === 1 && 
                  (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                  (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                   emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
                ).map(director => (
                  <div key={director.id}>
                    {renderOrgChartBox(director, true)}
                  </div>
                ))}
              </div>
            </div>

            {/* Vertical Connector from Level 1 to Level 2 */}
            <div className="flex justify-center">
              {renderConnectorLine('w-px', 'h-12')}
            </div>

            {/* Level 2 - General Manager */}
            <div className="flex justify-center">
              <div className="flex items-end gap-8">
                {employees.filter(emp => emp.hierarchy_level === 2 &&
                  (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                  (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                   emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
                ).map(gm => (
                  <div key={gm.id}>
                    {renderOrgChartBox(gm, true)}
                  </div>
                ))}
              </div>
            </div>

            {/* Vertical Connector from Level 2 to Level 3 */}
            <div className="flex justify-center">
              {renderConnectorLine('w-px', 'h-12')}
            </div>

            {/* Level 3 - Department Heads - All at same vertical level */}
            <div className="flex justify-center">
              <div className="flex items-end gap-12 justify-center">
                {['Finance', 'Operations', 'Compliance'].map(dept => {
                  const deptHead = employees.find(emp => 
                    emp.hierarchy_level === 3 && 
                    emp.department === dept &&
                    (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                    (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
                  );
                  
                  if (!deptHead && selectedDepartment !== 'all' && selectedDepartment !== dept) {
                    return null;
                  }

                  return (
                    <div key={dept} className="flex flex-col items-center">
                      {/* Department Head - Same vertical level */}
                      {deptHead ? (
                        renderOrgChartBox(deptHead)
                      ) : (
                        <div className="rounded-lg p-4 shadow-md bg-gray-200 text-gray-500 min-w-[220px] text-center">
                          <div className="flex items-center gap-3 justify-center">
                            <div className="text-2xl">{getDepartmentIcon(dept)}</div>
                            <div>
                              <h3 className="font-bold text-sm">NA</h3>
                              <p className="text-xs">Chief {dept} Officer</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Level 4+ - Subordinates organized by hierarchy level */}
            <div className="space-y-12">
              {/* Level 4 - All Assistant Managers and similar roles at same vertical level */}
              {employees.filter(emp => emp.hierarchy_level === 4 &&
                (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                 emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
              ).length > 0 && (
                <div>
                  {/* Connector from Level 3 to Level 4 */}
                  <div className="flex justify-center mb-8">
                    {renderConnectorLine('w-px', 'h-8')}
                  </div>
                  
                  <div className="flex justify-center">
                    <div className="flex items-end gap-12 justify-center">
                      {['Finance', 'Operations', 'Compliance'].map(dept => {
                        const deptEmployees = employees.filter(emp => 
                          emp.hierarchy_level === 4 && 
                          emp.department === dept &&
                          (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                          (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
                        );
                        
                        return (
                          <div key={dept} className="flex flex-col items-center space-y-4 min-w-[220px]">
                            {deptEmployees.map(emp => (
                              <div key={emp.id}>
                                {renderOrgChartBox(emp)}
                              </div>
                            ))}
                            {deptEmployees.length === 0 && (
                              <div className="opacity-0 min-h-[80px]">
                                {/* Placeholder to maintain spacing */}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Level 5 - All Executive roles at same vertical level */}
              {employees.filter(emp => emp.hierarchy_level === 5 &&
                (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                 emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
              ).length > 0 && (
                <div>
                  {/* Connector from Level 4 to Level 5 */}
                  <div className="flex justify-center mb-8">
                    {renderConnectorLine('w-px', 'h-8')}
                  </div>
                  
                  <div className="flex justify-center">
                    <div className="flex items-end gap-12 justify-center">
                      {['Finance', 'Operations', 'Compliance'].map(dept => {
                        const deptEmployees = employees.filter(emp => 
                          emp.hierarchy_level === 5 && 
                          emp.department === dept &&
                          (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                          (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
                        );
                        
                        return (
                          <div key={dept} className="flex flex-col items-center space-y-4 min-w-[220px]">
                            {deptEmployees.map(emp => (
                              <div key={emp.id} className="transform scale-95">
                                {renderOrgChartBox(emp)}
                              </div>
                            ))}
                            {deptEmployees.length === 0 && (
                              <div className="opacity-0 min-h-[70px]">
                                {/* Placeholder to maintain spacing */}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Level 6+ - Any remaining lower level employees */}
              {employees.filter(emp => (emp.hierarchy_level || 6) >= 6 &&
                (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                 emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
              ).length > 0 && (
                <div>
                  {/* Connector from previous level */}
                  <div className="flex justify-center mb-8">
                    {renderConnectorLine('w-px', 'h-8')}
                  </div>
                  
                  <div className="flex justify-center">
                    <div className="flex items-end gap-12 justify-center">
                      {['Finance', 'Operations', 'Compliance'].map(dept => {
                        const deptEmployees = employees.filter(emp => 
                          (emp.hierarchy_level || 6) >= 6 && 
                          emp.department === dept &&
                          (selectedDepartment === 'all' || emp.department === selectedDepartment) &&
                          (searchTerm === '' || emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           emp.designation.toLowerCase().includes(searchTerm.toLowerCase()))
                        );
                        
                        return (
                          <div key={dept} className="flex flex-col items-center space-y-3 min-w-[220px]">
                            {deptEmployees.map(emp => (
                              <div key={emp.id} className="transform scale-90">
                                {renderOrgChartBox(emp)}
                              </div>
                            ))}
                            {deptEmployees.length === 0 && (
                              <div className="opacity-0 min-h-[60px]">
                                {/* Placeholder to maintain spacing */}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Department View Tab */}
      <div className="container mx-auto px-6 pb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Department View
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {departmentGroups.map(group => (
                <Card key={group.department} className="overflow-hidden">
                  <CardHeader 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => toggleDepartment(group.department)}
                  >
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getDepartmentIcon(group.department)}</span>
                        <span>{group.department}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{group.count}</Badge>
                        {expandedDepartments.has(group.department) ? 
                          <ChevronDown className="h-4 w-4" /> : 
                          <ChevronRight className="h-4 w-4" />
                        }
                      </div>
                    </CardTitle>
                  </CardHeader>
                  
                  {expandedDepartments.has(group.department) && (
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {group.employees.map(emp => (
                          <div key={emp.id} className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                               onClick={() => handleEmployeeClick(emp)}>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {getInitials(emp.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{emp.name}</p>
                                <p className="text-xs text-gray-600 truncate">{emp.designation}</p>
                              </div>
                              <Badge className={`text-xs ${getStatusColor(emp.status)}`}>
                                {emp.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Details Dialog */}
      <EmployeeDetailsDialog
        employee={selectedEmployee}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isEditMode={false}
      />
    </div>
  );
}
