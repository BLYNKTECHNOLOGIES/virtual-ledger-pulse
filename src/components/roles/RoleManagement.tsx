
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Shield, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CreateRoleDialog } from "./CreateRoleDialog";

interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  created_at: string;
  permissions: string[];
}

export function RoleManagement() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchRoles = async () => {
    try {
      console.log('Fetching roles...');
      // Fetch roles with their permissions
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        throw rolesError;
      }

      console.log('Roles data:', rolesData);

      // Fetch permissions for each role
      const rolesWithPermissions = await Promise.all(
        rolesData.map(async (role) => {
          const { data: permissions, error: permError } = await supabase
            .from('role_permissions')
            .select('permission')
            .eq('role_id', role.id);

          if (permError) {
            console.error('Error fetching permissions for role:', role.id, permError);
            throw permError;
          }

          return {
            ...role,
            permissions: permissions.map(p => p.permission)
          };
        })
      );

      console.log('Roles with permissions:', rolesWithPermissions);
      setRoles(rolesWithPermissions);
    } catch (error: any) {
      console.error('Error in fetchRoles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch roles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleDeleteRole = async (roleId: string, roleName: string, isSystemRole: boolean) => {
    if (isSystemRole) {
      toast({
        title: "Cannot Delete",
        description: "System roles cannot be deleted",
        variant: "destructive"
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
      return;
    }

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
      toast({
        title: "Error",
        description: "Failed to delete role",
        variant: "destructive"
      });
    }
  };

  const formatPermissionName = (permission: string) => {
    return permission
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              {role.description && (
                <p className="text-sm text-gray-600 mt-2">{role.description}</p>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">
                    Permissions ({role.permissions.length})
                  </h4>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {role.permissions.map((permission) => (
                      <Badge
                        key={permission}
                        variant="outline"
                        className="text-xs"
                      >
                        {formatPermissionName(permission)}
                      </Badge>
                    ))}
                  </div>
                  {role.permissions.length === 0 && (
                    <p className="text-xs text-gray-500 italic">No permissions assigned</p>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="text-xs text-gray-500">
                    Created: {new Date(role.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8 px-2">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    {!role.is_system_role && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteRole(role.id, role.name, role.is_system_role)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {roles.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No roles found. Create your first role to get started.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onRoleCreated={fetchRoles}
      />
    </div>
  );
}
