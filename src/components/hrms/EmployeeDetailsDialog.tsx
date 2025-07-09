
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

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
  department_id?: string;
  position_id?: string;
}

interface EmployeeDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  isEditMode: boolean;
}

export function EmployeeDetailsDialog({ open, onOpenChange, employee, isEditMode }: EmployeeDetailsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: employee?.name || "",
    email: employee?.email || "",
    phone: employee?.phone || "",
    department_id: employee?.department_id || "",
    position_id: employee?.position_id || "",
    salary: employee?.salary?.toString() || "",
    status: employee?.status || "ACTIVE"
  });

  // Fetch departments and positions
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('hierarchy_level', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', formData.department_id],
    queryFn: async () => {
      if (!formData.department_id) return [];
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('department_id', formData.department_id)
        .eq('is_active', true)
        .order('hierarchy_level', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!formData.department_id,
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!employee) throw new Error("No employee selected");
      
      const { error } = await supabase
        .from('employees')
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          department_id: data.department_id || null,
          position_id: data.position_id || null,
          salary: parseFloat(data.salary),
          status: data.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', employee.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Employee Updated",
        description: "Employee details have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['employees_info'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update employee: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode) {
      updateEmployeeMutation.mutate(formData);
    }
  };

  if (!employee) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-gray-600 mb-4">No employee record found for this user.</p>
            <p className="text-sm text-gray-500">Please contact your administrator to set up your employee profile.</p>
          </div>
          <div className="flex justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Employee" : "Employee Details"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="employee_id">Employee ID</Label>
              <Input
                id="employee_id"
                value={employee.employee_id}
                disabled
                className="bg-gray-100"
              />
            </div>
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={!isEditMode}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                disabled={!isEditMode}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                disabled={!isEditMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="department">Department *</Label>
              <Select 
                value={formData.department_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, department_id: value, position_id: "" }))}
                disabled={!isEditMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.icon} {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="position">Position *</Label>
              <Select 
                value={formData.position_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, position_id: value }))}
                disabled={!isEditMode || !formData.department_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salary">Salary (₹) *</Label>
              <Input
                id="salary"
                type="number"
                value={formData.salary}
                onChange={(e) => setFormData(prev => ({ ...prev, salary: e.target.value }))}
                disabled={!isEditMode}
                required
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                disabled={!isEditMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Joining Date</Label>
            <p className="text-sm text-gray-600 mt-1">
              {new Date(employee.date_of_joining).toLocaleDateString()}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isEditMode ? "Cancel" : "Close"}
            </Button>
            {isEditMode && (
              <Button type="submit" disabled={updateEmployeeMutation.isPending}>
                {updateEmployeeMutation.isPending ? "Updating..." : "Update Employee"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
