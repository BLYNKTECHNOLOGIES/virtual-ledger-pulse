import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Edit, Trash2, UserPlus, UserCheck, Shield, CheckCircle, XCircle } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { AddUserDialog } from "@/components/user-management/AddUserDialog";
import { useAuth } from "@/hooks/useAuth";

// Mock data for pending users
const mockPendingUsers = [
  {
    id: 1,
    username: "newuser1",
    email: "newuser1@gmail.com",
    firstName: "John",
    lastName: "Doe",
    requested: "20/6/2025",
    status: "Pending"
  },
  {
    id: 2,
    username: "newuser2",
    email: "newuser2@gmail.com",
    firstName: "Jane",
    lastName: "Smith",
    requested: "19/6/2025",
    status: "Pending"
  }
];

// Mock data for roles
const mockRoles = [
  {
    id: 1,
    name: "Admin",
    description: "Full system access with all permissions",
    userCount: 3,
    permissions: ["CREATE", "READ", "UPDATE", "DELETE", "MANAGE_USERS"]
  },
  {
    id: 2,
    name: "User",
    description: "Standard user with limited permissions",
    userCount: 8,
    permissions: ["READ", "UPDATE_OWN"]
  },
  {
    id: 3,
    name: "Manager",
    description: "Department manager with elevated permissions",
    userCount: 2,
    permissions: ["CREATE", "READ", "UPDATE", "MANAGE_DEPARTMENT"]
  }
];

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const { users, isLoading, fetchUsers, createUser, deleteUser } = useUsers();
  const { user: currentUser, isAdmin } = useAuth();

  console.log('=== USER MANAGEMENT DEBUG ===');
  console.log('Current authenticated user:', currentUser);
  console.log('Is admin:', isAdmin);
  console.log('All users from hook:', users);
  console.log('Users array length:', users.length);
  console.log('Is loading:', isLoading);
  console.log('=== END DEBUG ===');

  // Filter users for active users tab - show all users
  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  console.log('Filtered users:', filteredUsers);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to deactivate this user?')) {
      await deleteUser(userId);
    }
  };

  const handleApproveUser = (userId: number) => {
    console.log("Approving user:", userId);
    // Add approval logic here
  };

  const handleRejectUser = (userId: number) => {
    console.log("Rejecting user:", userId);
    // Add rejection logic here
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
        <p className="text-gray-600 mt-1">Manage system users, approvals, and roles</p>
      </div>

      <Tabs defaultValue="active-users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active-users" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            All Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="approve-users" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Approve Users
          </TabsTrigger>
          <TabsTrigger value="manage-roles" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Manage Roles
          </TabsTrigger>
        </TabsList>

        {/* Active Users Tab */}
        <TabsContent value="active-users" className="space-y-4">
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
              
              {/* Debug information */}
              <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
                <div>Debug Info:</div>
                <div>• Auth User: {currentUser ? `${currentUser.username} (${currentUser.email})` : 'Not logged in'}</div>
                <div>• Is Admin: {isAdmin ? 'Yes' : 'No'}</div>
                <div>• Loading: {isLoading ? 'Yes' : 'No'}</div>
                <div>• Total Users: {users.length}</div>
                <div>• Filtered Users: {filteredUsers.length}</div>
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
                  {filteredUsers.map((user) => (
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
                            : "There are no users in the database yet. This could be due to database permissions or the users table being empty."
                          }
                        </p>
                        
                        {!searchTerm && (
                          <div className="mt-4 text-xs text-gray-400">
                            <p>Check the browser console for detailed debugging information.</p>
                            <p>Make sure you have proper database access permissions.</p>
                          </div>
                        )}
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

        {/* Approve Users Tab */}
        <TabsContent value="approve-users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending User Approvals ({mockPendingUsers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockPendingUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{user.firstName} {user.lastName}</h3>
                        <Badge variant="outline" className="text-orange-600 border-orange-200">
                          Pending
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">@{user.username}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                      <p className="text-xs text-gray-500">Requested: {user.requested}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApproveUser(user.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-red-600 hover:text-red-700 border-red-200"
                        onClick={() => handleRejectUser(user.id)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
                
                {mockPendingUsers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No pending user approvals at this time.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Roles Tab */}
        <TabsContent value="manage-roles" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>System Roles ({mockRoles.length})</CardTitle>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Role
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {mockRoles.map((role) => (
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
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Users: <span className="text-blue-600">{role.userCount}</span>
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {role.permissions.map((permission) => (
                            <Badge key={permission} variant="secondary" className="text-xs">
                              {permission}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
