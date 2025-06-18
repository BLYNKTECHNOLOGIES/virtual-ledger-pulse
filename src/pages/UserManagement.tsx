
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Edit, Trash2, UserPlus, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AddUserDialog } from "@/components/AddUserDialog";
import { AssignRoleDialog } from "@/components/users/AssignRoleDialog";
import { RoleManagement } from "@/components/roles/RoleManagement";
import { useToast } from "@/hooks/use-toast";

export default function UserManagement() {
  const { users, deleteUser, refreshUsers } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  useEffect(() => {
    refreshUsers();
  }, []);

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "INACTIVE":
        return <Badge variant="secondary">Inactive</Badge>;
      case "SUSPENDED":
        return <Badge className="bg-red-100 text-red-800">Suspended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        await deleteUser(id);
        toast({
          title: "Success",
          description: "User deleted successfully"
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to delete user",
          variant: "destructive"
        });
      }
    }
  };

  const handleManageRoles = (userId: string) => {
    setSelectedUserId(userId);
    setShowRoleDialog(true);
  };

  const handleRolesUpdated = () => {
    refreshUsers();
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">Manage system users, roles, and permissions</p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          {/* Users Header Controls */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Users ({filteredUsers.length})</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    New User
                  </Button>
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

          {/* Users Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-gray-900 truncate">{user.username}</h3>
                      {getStatusBadge(user.status)}
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600 truncate">{user.email}</p>
                      {(user.first_name || user.last_name) && (
                        <p className="text-sm text-gray-600 truncate">
                          {[user.first_name, user.last_name].filter(Boolean).join(' ')}
                        </p>
                      )}
                      {user.phone && (
                        <p className="text-xs text-gray-500">📞 {user.phone}</p>
                      )}
                      <p className="text-xs text-gray-500">📅 Created: {user.created_at}</p>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 px-2"
                          onClick={() => handleManageRoles(user.id)}
                        >
                          <Settings className="h-3 w-3 mr-1" />
                          Roles
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2">
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 px-2 text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteUser(user.id, user.username)}
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

          {filteredUsers.length === 0 && (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">
                  No users found matching your search criteria.
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="roles">
          <RoleManagement />
        </TabsContent>
      </Tabs>

      <AddUserDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog} 
      />

      <AssignRoleDialog
        open={showRoleDialog}
        onOpenChange={setShowRoleDialog}
        userId={selectedUserId}
        currentRoles={[]}
        onRolesUpdated={handleRolesUpdated}
      />
    </div>
  );
}
