
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Edit, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AddUserDialog } from "@/components/AddUserDialog";
import { useToast } from "@/hooks/use-toast";

export default function UserManagement() {
  const { users, deleteUser } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    return role === "Admin" ? (
      <Badge className="bg-blue-100 text-blue-800">Admin</Badge>
    ) : (
      <Badge variant="secondary">User</Badge>
    );
  };

  const handleDeleteUser = (id: string, username: string) => {
    if (confirm(`Are you sure you want to delete user "${username}"?`)) {
      deleteUser(id);
      toast({
        title: "Success",
        description: "User deleted successfully"
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">Manage system users and their permissions</p>
      </div>

      {/* Header Controls */}
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
                  {getRoleBadge(user.role)}
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-gray-600 truncate">{user.email}</p>
                  <p className="text-xs text-gray-500">📅 Created: {user.created}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Status:</span>
                    <Badge variant={user.status === "Active" ? "default" : "secondary"} className="text-xs">
                      {user.status}
                    </Badge>
                  </div>
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

      <AddUserDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog} 
      />
    </div>
  );
}
