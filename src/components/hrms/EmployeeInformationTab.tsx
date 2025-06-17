
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Phone, Mail, Calendar, DollarSign } from "lucide-react";
import { EmployeeDetailsDialog } from "./EmployeeDetailsDialog";

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
}

export function EmployeeInformationTab() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees_info'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('onboarding_completed', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Employee[];
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'INACTIVE': return 'bg-red-100 text-red-800';
      case 'ON_LEAVE': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleView = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsEditMode(false);
    setDialogOpen(true);
  };

  const handleEdit = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsEditMode(true);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading employees...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employee Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employees && employees.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Employee Details</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Department</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Designation</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Joining Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Salary</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{employee.name}</p>
                          <p className="text-sm text-blue-600">{employee.employee_id}</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {employee.email}
                            </div>
                            {employee.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {employee.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{employee.department}</td>
                      <td className="py-3 px-4">{employee.designation}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {new Date(employee.date_of_joining).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          ₹{employee.salary.toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={getStatusColor(employee.status)}>{employee.status}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleView(employee)}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleEdit(employee)}>
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No employees found
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeDetailsDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={selectedEmployee}
        isEditMode={isEditMode}
      />
    </>
  );
}
