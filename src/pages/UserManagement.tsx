import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Edit, Trash2, UserPlus, UserCheck, Shield, Users } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { AddUserDialog } from "@/components/user-management/AddUserDialog";
import { AddRoleDialog } from "@/components/user-management/AddRoleDialog";
import { EditUserDialog } from "@/components/user-management/EditUserDialog";
import { EditRoleDialog } from "@/components/user-management/EditRoleDialog";
import { RoleUsersDialog } from "@/components/user-management/RoleUsersDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { DatabaseUser } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";

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

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isLoadingOnlineUsers, setIsLoadingOnlineUsers] = useState(true);
  const [editingUser, setEditingUser] = useState<DatabaseUser | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [viewingRoleUsers, setViewingRoleUsers] = useState<Role | null>(null);
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
      
      // Fetch roles with their permissions
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select(`
          id,
          name,
          description,
          role_permissions!inner(permission)
        `);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        return;
      }

      // Get user count for each role and format permissions
      const rolesWithCount = await Promise.all(
        (rolesData || []).map(async (role) => {
          const { data: userRoles, error: countError } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role_id', role.id);

          if (countError) {
            console.error('Error counting users for role:', role.name, countError);
          }

          // Extract permissions from the nested structure
          const permissions = role.role_permissions?.map((rp: any) => rp.permission) || [];

          return {
            id: role.id,
            name: role.name,
            description: role.description || '',
            permissions,
            user_count: userRoles?.length || 0
          };
        })
      );

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

  // Check if current user should see a tab based on permissions
  const shouldShowTab = (tabName: string) => {
    if (isLoadingPermissions) {
      return false;
    }
    
    console.log('Checking tab access for:', tabName);
    console.log('User permissions:', permissions);
    
    switch (tabName) {
      case 'all-users':
        return hasPermission('user_management_view') || hasPermission('user_management_manage');
        
      case 'active-users':
        return hasPermission('user_management_view') || hasPermission('user_management_manage');
        
      case 'manage-roles':
        return hasPermission('user_management_manage');
        
      default:
        return false;
    }
  };

  // Get the list of visible tabs
  const getVisibleTabs = () => {
    const tabs = [];
    
    if (shouldShowTab('all-users')) {
      tabs.push('all-users');
    }
    if (shouldShowTab('active-users')) {
      tabs.push('active-users');
    }
    if (shouldShowTab('manage-roles')) {
      tabs.push('manage-roles');
    }
    
    return tabs;
  };

  const visibleTabs = getVisibleTabs();
  const defaultTab = visibleTabs.length > 0 ? visibleTabs[0] : null;

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
    if (window.confirm('Are you sure you want to permanently delete this user and all related data? This action cannot be undone.')) {
      await deleteUser(userId);
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

  // Handle tab change - scroll to top
  const handleTabChange = (value: string) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If user has no permissions to see any tabs, show access denied
  if (visibleTabs.length === 0 && !isLoadingPermissions) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Access Denied</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <h3 className="text-lg font-medium">Access Denied</h3>
                <p className="text-sm">You don't have permission to access the User Management module.</p>
                <p className="text-xs mt-2 text-gray-400">
                  Your permissions: {permissions.join(', ') || 'No permissions assigned'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
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

  if (!defaultTab) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">No accessible tabs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-200 via-purple-200 to-indigo-200 text-slate-800 rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-violet-100 rounded-xl shadow-lg">
                  <Users className="h-8 w-8 text-violet-700" />
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

      <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">Manage system users, online activity, and roles</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6" onValueChange={handleTabChange}>
        <TabsList className={`grid w-full grid-cols-${Math.min(visibleTabs.length, 3)}`}>
          {shouldShowTab('all-users') && (
            <TabsTrigger value="all-users" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              All Users ({users.length})
            </TabsTrigger>
          )}
          {shouldShowTab('active-users') && (
            <TabsTrigger value="active-users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active Users ({onlineUsers.length})
            </TabsTrigger>
          )}
          {shouldShowTab('manage-roles') && (
            <TabsTrigger value="manage-roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Manage Roles ({roles.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* All Users Tab */}
        {shouldShowTab('all-users') && (
          <TabsContent value="all-users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>All Users ({users.length} total)</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchUsers}>
                      🔄 Refresh
                    </Button>
                    {hasPermission('user_management_manage') && (
                      <AddUserDialog onAddUser={createUser} />
                    )}
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
                            
                            <div className="space-y-1">
                              <p className="text-sm text-gray-600 truncate">@{user.username}</p>
                              <p className="text-sm text-gray-600 truncate">{user.email}</p>
                              {user.phone && (
                                <p className="text-sm text-gray-600 truncate">{user.phone}</p>
                              )}
                              <p className="text-xs text-gray-500">📅 Created: {formatDate(user.created_at)}</p>
                            </div>

                            {hasPermission('user_management_manage') && (
                              <div className="flex justify-between items-center pt-2 border-t">
                                <div className="flex gap-1">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-8 px-2"
                                    onClick={() => setEditingUser(user)}
                                  >
                                    <Edit className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive" 
                                    className="h-8 px-2 bg-red-600 hover:bg-red-700 text-white"
                                    onClick={() => handleDeleteUser(user.id)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <div className="space-y-4">
                        <div className="text-gray-500">
                          <UserCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <h3 className="text-lg font-medium">
                            {searchTerm ? "No Users Match Search" : "No Users Found"}
                          </h3>
                          <p className="text-sm">
                            {searchTerm 
                              ? "No users match your search criteria. Try a different search term."
                              : "There are no users in the database yet."
                            }
                          </p>
                        </div>
                        {!searchTerm && hasPermission('user_management_manage') && (
                          <div className="space-y-2">
                            <p className="text-sm text-gray-600">Get started by adding your first user:</p>
                            <AddUserDialog onAddUser={createUser} />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        )}

        {/* Active Users Tab */}
        {shouldShowTab('active-users') && (
          <TabsContent value="active-users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Active Users ({onlineUsers.length})</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchOnlineUsers}>
                    🔄 Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingOnlineUsers ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    <span className="ml-2">Loading active users...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {onlineUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            <h3 className="font-semibold">
                              {user.first_name && user.last_name 
                                ? `${user.first_name} ${user.last_name}`
                                : user.username
                              }
                            </h3>
                            <Badge variant="outline" className="text-green-600 border-green-200">
                              Online
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">@{user.username}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                          <p className="text-xs text-gray-500">Last seen: {formatTime(user.last_seen)}</p>
                        </div>
                      </div>
                    ))}
                    
                    {onlineUsers.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <h3 className="text-lg font-medium">No Active Users</h3>
                        <p className="text-sm">No users are currently online or recently active.</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Manage Roles Tab */}
        {shouldShowTab('manage-roles') && (
          <TabsContent value="manage-roles" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>System Roles ({roles.length})</CardTitle>
                  <AddRoleDialog onAddRole={createRole} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingRoles ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2">Loading roles...</span>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {roles.map((role) => (
                      <div key={role.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{role.name}</h3>
                            <p className="text-gray-600 text-sm">{role.description}</p>
                            <div className="mt-2">
                              <p className="text-xs text-gray-500 mb-1">Permissions:</p>
                              <div className="flex flex-wrap gap-1">
                                {role.permissions.map((permission) => (
                                  <Badge key={permission} variant="outline" className="text-xs">
                                    {permission}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setEditingRole(role)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 hover:text-red-700"
                              onClick={() => deleteRole(role.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div>
                            <Button
                              variant="link"
                              className="p-0 h-auto text-blue-600 hover:text-blue-700"
                              onClick={() => setViewingRoleUsers(role)}
                            >
                              Users: <span className="font-medium ml-1">{role.user_count}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {roles.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <h3 className="text-lg font-medium">No Roles Found</h3>
                        <p className="text-sm">Get started by creating your first role.</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onSave={updateUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Edit Role Dialog */}
      {editingRole && (
        <EditRoleDialog
          role={editingRole}
          onSave={updateRole}
          onClose={() => setEditingRole(null)}
        />
      )}

      {/* Role Users Dialog */}
      {viewingRoleUsers && (
        <RoleUsersDialog
          role={viewingRoleUsers}
          onClose={() => setViewingRoleUsers(null)}
        />
      )}
      </div>
    </div>
  );
}
