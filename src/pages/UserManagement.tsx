import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Edit, Trash2, UserPlus, UserCheck, Shield, Users, Settings, Key, Settings2 } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { AddUserDialog } from "@/components/user-management/AddUserDialog";
import { AddRoleDialog } from "@/components/user-management/AddRoleDialog";
import { EditUserDialog } from "@/components/user-management/EditUserDialog";
import { EditRoleDialog } from "@/components/user-management/EditRoleDialog";
import { RoleUsersDialog } from "@/components/user-management/RoleUsersDialog";
import { PendingRegistrationsTab } from "@/components/user-management/PendingRegistrationsTab";
import { ResetPasswordDialog } from "@/components/user-management/ResetPasswordDialog";
import { FunctionsTab } from "@/components/user-management/FunctionsTab";
import { usePermissions } from "@/hooks/usePermissions";
import { DatabaseUser } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/PermissionGate";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  user_count: number;
}

interface OnlineUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  last_seen: string;
  status: string;
}

// Map old permission format to new format (for backwards compatibility)
const permissionMapping: Record<string, string> = {
  'view_dashboard': 'dashboard_view',
  'view_sales': 'sales_view',
  'view_purchase': 'purchase_view',
  'view_bams': 'bams_view',
  'view_clients': 'clients_view',
  'view_leads': 'leads_view',
  'view_user_management': 'user_management_view',
  'view_hrms': 'hrms_view',
  'view_payroll': 'payroll_view',
  'view_compliance': 'compliance_view',
  'view_stock': 'stock_view',
  'view_stock_management': 'stock_view',
  'view_accounting': 'accounting_view',
  'view_video_kyc': 'video_kyc_view',
  'view_kyc_approvals': 'kyc_approvals_view',
  'view_statistics': 'statistics_view',
  'view_ems': 'ems_view',
};

// Normalize and deduplicate permissions array
const normalizePermissions = (perms: string[]): string[] => {
  const normalized = perms.map(p => permissionMapping[p] || p);
  // IMPORTANT: do NOT filter unknown/legacy permissions.
  // This project historically stored multiple permission formats in app_permission.
  // Filtering makes the UI appear fine but would DELETE legacy permissions on save.
  return [...new Set(normalized)];
};

// Format permission for display
const formatPermissionDisplay = (perm: string): string => {
  return perm.replace(/_/g, ' ');
};

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isLoadingOnlineUsers, setIsLoadingOnlineUsers] = useState(true);
  const [editingUser, setEditingUser] = useState<DatabaseUser | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [viewingRoleUsers, setViewingRoleUsers] = useState<Role | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<DatabaseUser | null>(null);
  const { users, isLoading, fetchUsers, createUser, deleteUser, updateUser } = useUsers();
  const { permissions, isLoading: isLoadingPermissions, hasPermission } = usePermissions();

  // Scroll to top when component mounts or tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Filter users - show all users
  const filteredUsers = users.filter((user: DatabaseUser) =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const fetchRoles = async () => {
    try {
      setIsLoadingRoles(true);
      
      // Fetch roles with their permissions and user counts in one efficient query
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select(`
          id,
          name,
          description,
          role_permissions(permission)
        `);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        return;
      }

      // Get user counts for all roles in a single query
      const { data: userCounts, error: countError } = await supabase
        .from('user_roles')
        .select('role_id, user_id');

      if (countError) {
        console.error('Error fetching user counts:', countError);
      }

      // Create a map of role_id to user count
      const userCountMap = new Map<string, number>();
      userCounts?.forEach(userRole => {
        const currentCount = userCountMap.get(userRole.role_id) || 0;
        userCountMap.set(userRole.role_id, currentCount + 1);
      });

      // Format roles with correct user counts and normalized permissions
      const rolesWithCount = (rolesData || []).map((role) => {
        // Extract permissions from the nested structure and normalize them
        const rawPermissions = role.role_permissions?.map((rp: any) => rp.permission) || [];
        const permissions = normalizePermissions(rawPermissions);

        return {
          id: role.id,
          name: role.name,
          description: role.description || '',
          permissions,
          user_count: userCountMap.get(role.id) || 0
        };
      });

      setRoles(rolesWithCount);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const fetchOnlineUsers = async () => {
    try {
      setIsLoadingOnlineUsers(true);
      
      // Consider users online if they've been active in the last 5 minutes
      const recentThreshold = new Date();
      recentThreshold.setMinutes(recentThreshold.getMinutes() - 5);
      
      const { data: activeUsers, error } = await supabase
        .from('users')
        .select('id, username, email, first_name, last_name, last_activity, status')
        .eq('status', 'ACTIVE')
        .not('last_activity', 'is', null)
        .gte('last_activity', recentThreshold.toISOString())
        .order('last_activity', { ascending: false });

      if (error) {
        console.error('Error fetching online users:', error);
        return;
      }

      const onlineUsersData = activeUsers?.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        last_seen: user.last_activity || new Date().toISOString(),
        status: 'Online'
      })) || [];

      setOnlineUsers(onlineUsersData);
    } catch (error) {
      console.error('Error fetching online users:', error);
    } finally {
      setIsLoadingOnlineUsers(false);
    }
  };

  const createRole = async (roleData: { name: string; description: string; permissions: string[] }) => {
    try {
      console.log('Creating role with permissions:', roleData);
      
      const { data, error } = await supabase.rpc('create_role_with_permissions', {
        role_name: roleData.name,
        role_description: roleData.description,
        permissions: roleData.permissions
      });

      if (error) {
        console.error('Error creating role:', error);
        return { success: false, error };
      }

      console.log('Role created successfully with ID:', data);
      await fetchRoles();
      return { success: true, data };
    } catch (error) {
      console.error('Error creating role:', error);
      return { success: false, error };
    }
  };

  const updateRole = async (roleId: string, roleData: { name: string; description: string; permissions: string[] }) => {
    try {
      console.log('Updating role with permissions:', roleData);
      
      const { data, error } = await supabase.rpc('update_role_permissions', {
        p_role_id: roleId,
        p_role_name: roleData.name,
        p_role_description: roleData.description,
        p_permissions: roleData.permissions
      });

      if (error) {
        console.error('Error updating role:', error);
        return { success: false, error };
      }

      console.log('Role updated successfully');
      await fetchRoles();
      return { success: true };
    } catch (error) {
      console.error('Error updating role:', error);
      return { success: false, error };
    }
  };

  const deleteRole = async (roleId: string) => {
    if (window.confirm('Are you sure you want to delete this role?')) {
      try {
        const { error } = await supabase
          .from('roles')
          .delete()
          .eq('id', roleId);

        if (error) {
          console.error('Error deleting role:', error);
          return;
        }

        await fetchRoles();
      } catch (error) {
        console.error('Error deleting role:', error);
      }
    }
  };

  // Check user management permissions
  const hasViewPermission = hasPermission('user_management_view') || hasPermission('user_management_manage');
  const hasManagePermission = hasPermission('user_management_manage');

  useEffect(() => {
    fetchRoles();
    fetchOnlineUsers();
    
    // Set up interval to refresh online users every 30 seconds
    const interval = setInterval(fetchOnlineUsers, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const handleDeleteUser = async (userId: string) => {
    console.log('=== HANDLE DELETE USER TRIGGERED ===');
    console.log('handleDeleteUser called for userId:', userId);
    console.log('Current user permissions:', permissions);
    console.log('hasPermission user_management_manage:', hasPermission('user_management_manage'));
    console.log('Delete button should be visible:', hasPermission('user_management_manage'));
    
    if (!hasPermission('user_management_manage')) {
      console.error('User does not have permission to delete users');
      alert('You do not have permission to delete users');
      return;
    }
    
    if (window.confirm('Are you sure you want to permanently delete this user and all related data? This action cannot be undone.')) {
      console.log('User confirmed deletion, calling deleteUser...');
      try {
        const result = await deleteUser(userId);
        console.log('Delete result:', result);
        if (result?.success) {
          console.log('User deleted successfully');
        } else {
          console.error('Delete failed:', result?.error);
        }
      } catch (error) {
        console.error('Exception during delete:', error);
      }
    } else {
      console.log('User cancelled deletion');
    }
  };

  const getRoleBadgeVariant = (roleName?: string) => {
    switch (roleName?.toLowerCase()) {
      case 'admin':
        return 'destructive';
      case 'manager':
        return 'default';
      case 'user':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // If user has no permissions, show access denied
  if (!hasViewPermission && !isLoadingPermissions) {
    return (
      <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
        <div />
      </PermissionGate>
    );
  }

  if (isLoadingPermissions) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Loading permissions...</p>
        </div>
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Loading permissions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-violet-50 rounded-xl shadow-sm">
                  <Users className="h-8 w-8 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    User Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Manage users, roles, and permissions
                  </p>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>

      <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Pending Approvals
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              All Users
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Roles & Permissions
            </TabsTrigger>
            <TabsTrigger value="functions" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Functions
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              User Settings
            </TabsTrigger>
          </TabsList>

          {/* Pending Registrations Tab */}
          <TabsContent value="pending" className="space-y-4">
            <PermissionGate permissions={['user_management_manage']}>
              <PendingRegistrationsTab />
            </PermissionGate>
          </TabsContent>

          {/* All Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>All Users ({users.length} total)</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={fetchUsers}>
                        🔄 Refresh
                      </Button>
                      <PermissionGate permissions={['user_management_manage']}>
                        <AddUserDialog onAddUser={createUser} />
                      </PermissionGate>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2 mb-4">
                    <Search className="h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2">Loading users...</span>
                </div>
              ) : (
                <div>
                  {filteredUsers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredUsers.map((user: DatabaseUser) => (
                        <Card key={user.id} className="hover:shadow-lg transition-shadow">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex justify-between items-start">
                                <h3 className="font-semibold text-gray-900 truncate">
                                  {user.first_name && user.last_name 
                                    ? `${user.first_name} ${user.last_name}`
                                    : user.username
                                  }
                                </h3>
                                <div className="flex flex-col gap-1">
                                  <Badge variant={getRoleBadgeVariant(user.role?.name)}>
                                    {user.role?.name || 'No Role'}
                                  </Badge>
                                  <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                    {user.status}
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="space-y-1 text-sm text-gray-600">
                                <p><strong>Username:</strong> {user.username}</p>
                                <p><strong>Email:</strong> {user.email}</p>
                                {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
                                <p><strong>Created:</strong> {formatDate(user.created_at)}</p>
                              </div>
                              
                              <PermissionGate permissions={['user_management_manage']}>
                                <div className="flex justify-between pt-2 border-t">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingUser(user)}
                                    className="flex items-center gap-1"
                                  >
                                    <Edit className="h-3 w-3" />
                                    Edit
                                  </Button>
                                  
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setResetPasswordUser(user)}
                                    className="flex items-center gap-1"
                                  >
                                    <Key className="h-3 w-3" />
                                    Reset
                                  </Button>
                                  
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="flex items-center gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </Button>
                                </div>
                              </PermissionGate>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center text-gray-500">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No users found matching your search.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </PermissionGate>
          </TabsContent>

          {/* Roles & Permissions Tab */}
          <TabsContent value="roles" className="space-y-4">
            <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Roles & Permissions ({roles.length} roles)</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={fetchRoles}>
                        🔄 Refresh
                      </Button>
                      <PermissionGate permissions={['user_management_manage']}>
                        <AddRoleDialog onAddRole={createRole} />
                      </PermissionGate>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingRoles ? (
                    <div className="flex justify-center items-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2">Loading roles...</span>
                    </div>
                  ) : (
                    <div>
                      {roles.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {roles.map((role) => (
                            <Card key={role.id} className="hover:shadow-lg transition-shadow">
                              <CardContent className="p-4">
                                <div className="space-y-3">
                                  <div className="flex justify-between items-start">
                                    <h3 className="font-semibold text-gray-900">{role.name}</h3>
                                    <Badge variant={getRoleBadgeVariant(role.name)}>
                                      {role.user_count} users
                                    </Badge>
                                  </div>
                                  
                                  <p className="text-sm text-gray-600">{role.description}</p>
                                  
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Permissions:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {role.permissions.slice(0, 3).map((permission) => (
                                        <Badge key={permission} variant="outline" className="text-xs">
                                          {formatPermissionDisplay(permission)}
                                        </Badge>
                                      ))}
                                      {role.permissions.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{role.permissions.length - 3} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="flex justify-between pt-2 border-t gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setViewingRoleUsers(role)}
                                      className="flex items-center gap-1"
                                    >
                                      <Users className="h-3 w-3" />
                                      View Users
                                    </Button>
                                    
                                    <PermissionGate permissions={['user_management_manage']}>
                                      <div className="flex gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setEditingRole(role)}
                                          className="flex items-center gap-1"
                                        >
                                          <Edit className="h-3 w-3" />
                                          Edit
                                        </Button>
                                        
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => deleteRole(role.id)}
                                          className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          Delete
                                        </Button>
                                      </div>
                                    </PermissionGate>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <Card>
                          <CardContent className="p-8 text-center text-gray-500">
                            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No roles found.</p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </PermissionGate>
          </TabsContent>

          {/* User Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
              <Card>
                <CardHeader>
                  <CardTitle>Active Users & Settings ({onlineUsers.length} online)</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingOnlineUsers ? (
                    <div className="flex justify-center items-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2">Loading active users...</span>
                    </div>
                  ) : (
                    <div>
                      {onlineUsers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {onlineUsers.map((user) => (
                            <Card key={user.id} className="border-green-200 bg-green-50">
                              <CardContent className="p-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start">
                                    <h3 className="font-semibold text-gray-900">
                                      {user.first_name && user.last_name 
                                        ? `${user.first_name} ${user.last_name}`
                                        : user.username
                                      }
                                    </h3>
                                    <Badge variant="default" className="bg-green-600">
                                      Online
                                    </Badge>
                                  </div>
                                  
                                  <div className="space-y-1 text-sm text-gray-600">
                                    <p><strong>Username:</strong> {user.username}</p>
                                    <p><strong>Email:</strong> {user.email}</p>
                                    <p><strong>Last Seen:</strong> {formatTime(user.last_seen)}</p>
                                  </div>
                                  
                                  <PermissionGate permissions={['user_management_manage']}>
                                    <div className="pt-2 border-t">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                          // Add password reset functionality here
                                          alert(`Reset password for ${user.username}`);
                                        }}
                                      >
                                        Reset Password
                                      </Button>
                                    </div>
                                  </PermissionGate>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <Card>
                          <CardContent className="p-8 text-center text-gray-500">
                            <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No users are currently online.</p>
                            <p className="text-xs mt-2">Users are considered online if they've been active in the last 5 minutes.</p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </PermissionGate>
          </TabsContent>

          {/* Functions Tab */}
          <TabsContent value="functions" className="space-y-4">
            <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
              <FunctionsTab />
            </PermissionGate>
          </TabsContent>
        </Tabs>

      {/* Dialogs */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onSave={updateUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {editingRole && (
        <EditRoleDialog
          role={editingRole}
          onSave={updateRole}
          onClose={() => setEditingRole(null)}
        />
      )}

      {viewingRoleUsers && (
        <RoleUsersDialog
          role={viewingRoleUsers}
          onClose={() => setViewingRoleUsers(null)}
        />
      )}

      {resetPasswordUser && (
        <ResetPasswordDialog
          open={!!resetPasswordUser}
          onOpenChange={(open) => !open && setResetPasswordUser(null)}
          userId={resetPasswordUser.id}
          userName={resetPasswordUser.first_name && resetPasswordUser.last_name 
            ? `${resetPasswordUser.first_name} ${resetPasswordUser.last_name}` 
            : resetPasswordUser.username}
        />
      )}
    </div>
  );
}