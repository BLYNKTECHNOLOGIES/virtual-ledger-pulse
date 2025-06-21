
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Edit, Trash2, UserPlus, UserCheck, Shield, CheckCircle, XCircle } from "lucide-react";

// Mock data for active users
const mockActiveUsers = [
  {
    id: 1,
    username: "architadamle48",
    email: "architadamle48@gmail.com",
    role: "User",
    created: "22/5/2025",
    status: "Active"
  },
  {
    id: 2,
    username: "75666govindyadav",
    email: "75666govindyadav@gmail.com",
    role: "User", 
    created: "13/5/2025",
    status: "Active"
  },
  {
    id: 3,
    username: "priyankathakur3303",
    email: "priyankathakur3303@gmail.com",
    role: "User",
    created: "12/5/2025", 
    status: "Active"
  },
  {
    id: 4,
    username: "saxenapriya78",
    email: "saxenapriya7826@gmail.com",
    role: "Admin",
    created: "12/5/2025",
    status: "Active"
  },
  {
    id: 5,
    username: "blynkex.1",
    email: "blynkex.1@gmail.com",
    role: "Admin",
    created: "10/5/2025",
    status: "Active"
  }
];

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

  const filteredActiveUsers = mockActiveUsers.filter(user =>
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

  const handleApproveUser = (userId: number) => {
    console.log("Approving user:", userId);
    // Add approval logic here
  };

  const handleRejectUser = (userId: number) => {
    console.log("Rejecting user:", userId);
    // Add rejection logic here
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
            Active Users
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
                <CardTitle>Active Users ({filteredActiveUsers.length})</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    🔄 Refresh
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredActiveUsers.map((user) => (
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
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8 px-2">
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:text-red-700">
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
                  <Plus className="h-4 w-4 mr-2" />
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
