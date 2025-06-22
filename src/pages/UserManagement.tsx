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
import { useAuth } from "@/hooks/useAuth";
import { DatabaseUser } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";
import { ActiveUsersDisplay } from "@/components/user-management/ActiveUsersDisplay";

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
  const { users, isLoading, fetchUsers, createUser, deleteUser } = useUsers();
  const { user: currentUser, isAdmin } = useAuth();

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
      
      // Fetch roles with user count
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select(`
          id,
          name,
          description,
          user_roles(count)
        `);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        return;
      }

      // Transform the data to include user count
      const rolesWithCount = rolesData?.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description || '',
        permissions: [], // We'll add permissions later if needed
        user_count: role.user_roles?.length || 0
      })) || [];

      setRoles(rolesWithCount);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const createRole = async (roleData: { name: string; description: string; permissions: string[] }) => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          name: roleData.name,
          description: roleData.description,
          is_system_role: false
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating role:', error);
        return { success: false, error };
      }

      // Refresh roles list
      await fetchRoles();
      return { success: true, data };
    } catch (error) {
      console.error('Error creating role:', error);
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

        // Refresh roles list
        await fetchRoles();
      } catch (error) {
        console.error('Error deleting role:', error);
      }
    }
  };

  useEffect(() => {
    fetchRoles();
    // Remove fetchOnlineUsers() call since ActiveUsersDisplay handles its own data
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to deactivate this user?')) {
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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">Manage system users, monitor activity, and configure roles</p>
      </div>

      <Tabs defaultValue="all-users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all-users" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            All Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="active-users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Active Users
          </TabsTrigger>
          <TabsTrigger value="manage-roles" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Manage Roles ({roles.length})
          </TabsTrigger>
        </TabsList>

        {/* All Users Tab */}
        <TabsContent value="all-users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>All Users ({users.length} total)</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchUsers}>
                    🔄 Refresh
                  </Button>
                  <AddUserDialog onAddUser={createUser} />
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

                          <div className="flex justify-between items-center pt-2 border-t">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-8 px-2">
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 px-2 text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteUser(user.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
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
                      {!searchTerm && (
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

        {/* Active Users Tab - Updated */}
        <TabsContent value="active-users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Users Monitoring</CardTitle>
              <p className="text-sm text-gray-600">
                Monitor currently active users and request screen access for live viewing
              </p>
            </CardHeader>
            <CardContent>
              <ActiveUsersDisplay />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Roles Tab */}
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
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
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
                          <p className="text-sm font-medium text-gray-700">
                            Users: <span className="text-blue-600">{role.user_count}</span>
                          </p>
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
      </Tabs>
    </div>
  );
}
