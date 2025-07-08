import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  MapPin,
  Crown,
  User
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
}

interface DepartmentGroup {
  department: string;
  employees: Employee[];
  count: number;
}

export default function Management() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set(['Technology']));
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['management_employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
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
      case 'Technology': return '💻';
      case 'Sales': return '💼';
      case 'Marketing': return '📈';
      case 'HR': return '👥';
      case 'Finance': return '💰';
      default: return '🏢';
    }
  };

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Users className="h-8 w-8 text-slate-600" />
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

      {/* Management Tree */}
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
                  {group.employees.map(employee => (
                    <div 
                      key={employee.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-300"
                      onClick={() => handleEmployeeClick(employee)}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-medium">
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
                            {employee.user_id && (
                              <div title="Has user account">
                                <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                              </div>
                            )}
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
                            <Button variant="ghost" size="sm" className="text-xs">
                              <User className="h-3 w-3 mr-1" />
                              View Profile
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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

      <EmployeeDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={selectedEmployee}
        isEditMode={false}
      />
    </div>
  );
}