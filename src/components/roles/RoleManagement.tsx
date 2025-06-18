
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CreateRoleDialog } from "./CreateRoleDialog";

interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  created_at: string;
  permissions?: string[];
}

export function RoleManagement() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchRoles = async () => {
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;

      // Fetch permissions for each role
      const rolesWithPermissions = await Promise.all(
        rolesData.map(async (role) => {
          const { data: permissions, error: permError } = await supabase
            .from('role_permissions')
            .select('permission')
            .eq('role_id', role.id);

          if (permError) {
            console.error('Error fetching permissions for role:', role.name, permError);
            return { ...role, permissions: [] };
          }

          return {
            ...role,
            permissions: permissions.map(p => p.permission)
          };
        })
      );

      setRoles(rolesWithPermissions);
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch roles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
      try {
        const { error } = await supabase
          .from('roles')
          .delete()
          .eq('id', roleId);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Role deleted successfully"
        });
        
        fetchRoles();
      } catch (error: any) {
        console.error('Error deleting role:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete role",
          variant: "destructive"
        });
      }
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Role Management</h2>
          <p className="text-gray-600">Create and manage user roles and permissions</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Role
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role) => (
          <Card key={role.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">{role.name}</CardTitle>
                </div>
                {role.is_system_role && (
                  <Badge variant="secondary" className="text-xs">
                    System
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                {role.description || "No description provided"}
              </p>
              
              <div>
                <h4 className="text-sm font-medium mb-2">Permissions ({role.permissions?.length || 0})</h4>
                <div className="flex flex-wrap gap-1">
                  {role.permissions?.slice(0, 3).map((permission) => (
                    <Badge key={permission} variant="outline" className="text-xs">
                      {permission.replace('_', ' ')}
                    </Badge>
                  ))}
                  {(role.permissions?.length || 0) > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{(role.permissions?.length || 0) - 3} more
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1">
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                {!role.is_system_role && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDeleteRole(role.id, role.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateRoleDialog 
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onRoleCreated={fetchRoles}
      />
    </div>
  );
}
