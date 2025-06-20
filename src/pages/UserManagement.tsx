
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, UserPlus } from "lucide-react";

// Mock data for demonstration
const mockUsers = [
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
  },
  {
    id: 6,
    username: "sachinpandey565656",
    email: "sachinpandey565656@gmail.com",
    role: "User",
    created: "8/5/2025",
    status: "Active"
  },
  {
    id: 7,
    username: "blynks2024",
    email: "blynks2024@gmail.com",
    role: "User",
    created: "8/5/2025",
    status: "Active"
  },
  {
    id: 8,
    username: "rammpatel66",
    email: "rammpatel66@gmail.com",
    role: "User",
    created: "8/5/2025",
    status: "Active"
  },
  {
    id: 9,
    username: "abhisheksingh",
    email: "abhisheksinghto@gmail.com",
    role: "Admin",
    created: "8/5/2025",
    status: "Active"
  },
  {
    id: 10,
    username: "avkashpathrol8",
    email: "avkashpathrol8@gmail.com",
    role: "User",
    created: "7/5/2025",
    status: "Active"
  },
  {
    id: 11,
    username: "nikeshnagre2",
    email: "nikeshnagre2@gmail.com",
    role: "User",
    created: "7/5/2025",
    status: "Active"
  },
  {
    id: 12,
    username: "shubhamsingh01981",
    email: "shubhamsingh01981@gmail.com",
    role: "User",
    created: "7/5/2025",
    status: "Active"
  }
];

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Filtering Active");

  const filteredUsers = mockUsers.filter(user =>
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
            <CardTitle>Users</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Today
              </Button>
              <Button variant="outline" size="sm">
                This Week
              </Button>
              <Button variant="outline" size="sm">
                This Month
              </Button>
              <Button variant="outline" size="sm">
                Last Month
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                {filterStatus}
              </Button>
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

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
}
