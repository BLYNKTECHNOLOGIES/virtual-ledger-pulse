
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AVAILABLE_PERMISSIONS } from "@/hooks/usePermissions";
import type { Database } from "@/integrations/supabase/types";

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRoleCreated: () => void;
}

type Permission = Database['public']['Enums']['app_permission'];

export function CreateRoleDialog({ open, onOpenChange, onRoleCreated }: CreateRoleDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as Permission[]
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        const permissionInserts = formData.permissions.map(permission => ({
          role_id: role.id,
          permission: permission
        }));

        const { error: permError } = await supabase
          .from('role_permissions')
          .insert(permissionInserts);

        if (permError) throw permError;
      }

      toast({
        title: "Success",
        description: "Role created successfully"
      });

      setFormData({ name: "", description: "", permissions: [] });
      onRoleCreated();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create role",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionChange = (permissionId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permissionId as Permission]
        : prev.permissions.filter(p => p !== permissionId)
    }));
  };

  // Group permissions by category
  const pagePermissions = AVAILABLE_PERMISSIONS.filter(p => p.id.startsWith('view_'));
  const managementPermissions = AVAILABLE_PERMISSIONS.filter(p => p.id.startsWith('manage_'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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
            
            {/* Page Access Permissions */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-700">Page Access Permissions</h4>
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-3 border rounded bg-gray-50">
                {pagePermissions.map((permission) => (
                  <div key={permission.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={permission.id}
                      checked={formData.permissions.includes(permission.id as Permission)}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(permission.id, checked as boolean)
                      }
                    />
                    <div className="flex flex-col">
                      <Label htmlFor={permission.id} className="text-sm font-medium cursor-pointer">
                        {permission.label}
                      </Label>
                      <span className="text-xs text-gray-500">{permission.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Management Permissions */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-700">Management Permissions</h4>
              <div className="grid grid-cols-1 gap-3 p-3 border rounded bg-gray-50">
                {managementPermissions.map((permission) => (
                  <div key={permission.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={permission.id}
                      checked={formData.permissions.includes(permission.id as Permission)}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(permission.id, checked as boolean)
                      }
                    />
                    <div className="flex flex-col">
                      <Label htmlFor={permission.id} className="text-sm font-medium cursor-pointer">
                        {permission.label}
                      </Label>
                      <span className="text-xs text-gray-500">{permission.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
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
