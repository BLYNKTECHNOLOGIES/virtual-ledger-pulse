
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRoleCreated: () => void;
}

const PERMISSIONS = [
  { key: 'view_dashboard', label: 'View Dashboard', category: 'Navigation' },
  { key: 'view_sales', label: 'View Sales', category: 'Navigation' },
  { key: 'view_purchase', label: 'View Purchase', category: 'Navigation' },
  { key: 'view_bams', label: 'View BAMS', category: 'Navigation' },
  { key: 'view_clients', label: 'View Clients', category: 'Navigation' },
  { key: 'view_leads', label: 'View Leads', category: 'Navigation' },
  { key: 'view_user_management', label: 'View User Management', category: 'Navigation' },
  { key: 'view_hrms', label: 'View HRMS', category: 'Navigation' },
  { key: 'view_payroll', label: 'View Payroll', category: 'Navigation' },
  { key: 'view_compliance', label: 'View Compliance', category: 'Navigation' },
  { key: 'view_stock_management', label: 'View Stock Management', category: 'Navigation' },
  { key: 'view_accounting', label: 'View Accounting', category: 'Navigation' },
  { key: 'manage_users', label: 'Manage Users', category: 'Administration' },
  { key: 'manage_roles', label: 'Manage Roles', category: 'Administration' },
];

const PERMISSION_CATEGORIES = ['Navigation', 'Administration'];

export function CreateRoleDialog({ open, onOpenChange, onRoleCreated }: CreateRoleDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create the role
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .insert({
          name: formData.name,
          description: formData.description,
          is_system_role: false
        })
        .select()
        .single();

      if (roleError) throw roleError;

      // Add permissions to the role
      if (formData.permissions.length > 0) {
        const rolePermissions = formData.permissions.map(permission => ({
          role_id: role.id,
          permission: permission
        }));

        const { error: permissionError } = await supabase
          .from('role_permissions')
          .insert(rolePermissions);

        if (permissionError) throw permissionError;
      }

      toast({
        title: "Success",
        description: "Role created successfully"
      });

      setFormData({ name: "", description: "", permissions: [] });
      onRoleCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create role",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked 
        ? [...prev.permissions, permission]
        : prev.permissions.filter(p => p !== permission)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Role Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter role name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter role description"
              rows={3}
            />
          </div>

          <div className="space-y-4">
            <Label>Permissions</Label>
            {PERMISSION_CATEGORIES.map(category => (
              <div key={category} className="space-y-2">
                <h4 className="font-medium text-gray-900">{category}</h4>
                <div className="grid grid-cols-2 gap-2 pl-4">
                  {PERMISSIONS.filter(p => p.category === category).map(permission => (
                    <div key={permission.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission.key}
                        checked={formData.permissions.includes(permission.key)}
                        onCheckedChange={(checked) => 
                          handlePermissionChange(permission.key, checked as boolean)
                        }
                      />
                      <Label htmlFor={permission.key} className="text-sm">
                        {permission.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Role"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
