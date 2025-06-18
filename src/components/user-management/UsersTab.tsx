
import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Edit, Trash2, Settings, UserPlus } from "lucide-react";

interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: string;
  created_at: string;
}

interface UsersTabProps {
  users: User[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onAddUser: () => void;
  onEditUser: (userId: string) => void;
  onDeleteUser: (userId: string, username: string) => void;
  onManageRoles: (userId: string) => void;
}

export const UsersTab = memo(function UsersTab({
  users,
  searchTerm,
  onSearchChange,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onManageRoles
}: UsersTabProps) {
  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    
    const searchLower = searchTerm.toLowerCase();
    return users.filter(user =>
      user.username.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.first_name && user.first_name.toLowerCase().includes(searchLower)) ||
      (user.last_name && user.last_name.toLowerCase().includes(searchLower))
    );
  }, [users, searchTerm]);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <Button 
              size="sm" 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={onAddUser}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              New User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

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
                      onClick={() => onManageRoles(user.id)}
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Roles
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-2"
                      onClick={() => onEditUser(user.id)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-2 text-red-600 hover:text-red-700"
                      onClick={() => onDeleteUser(user.id, user.username)}
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
    </div>
  );
});
