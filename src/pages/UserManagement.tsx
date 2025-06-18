
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Edit, Trash2, UserPlus, Settings, Clock, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AddUserDialog } from "@/components/AddUserDialog";
import { AssignRoleDialog } from "@/components/users/AssignRoleDialog";
import { RoleManagement } from "@/components/roles/RoleManagement";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface PendingRegistration {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: string;
  submitted_at: string;
  rejection_reason?: string;
}

export default function UserManagement() {
  const { users, deleteUser, refreshUsers } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Fetch pending registrations
  const { data: pendingRegistrations, refetch: refetchPendingRegistrations } = useQuery({
    queryKey: ['pending_registrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_registrations')
        .select('*')
        .order('submitted_at', { ascending: false });
      
      if (error) throw error;
      return data as PendingRegistration[];
    },
  });

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

  const getRegistrationStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "APPROVED":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "REJECTED":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
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

  const handleApproveRegistration = async (registrationId: string) => {
    try {
      const { error } = await supabase.rpc('approve_registration', {
        registration_id: registrationId
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Registration approved successfully"
      });

      refetchPendingRegistrations();
      refreshUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve registration",
        variant: "destructive"
      });
    }
  };

  const handleRejectRegistration = async (registrationId: string, reason?: string) => {
    try {
      const { error } = await supabase.rpc('reject_registration', {
        registration_id: registrationId,
        reason: reason
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Registration rejected successfully"
      });

      refetchPendingRegistrations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject registration",
        variant: "destructive"
      });
    }
  };

  const pendingCount = pendingRegistrations?.filter(reg => reg.status === 'PENDING').length || 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">Manage system users, roles, and permissions</p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="approvals" className="relative">
            Approvals
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
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

        <TabsContent value="approvals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Registration Approvals ({pendingRegistrations?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!pendingRegistrations || pendingRegistrations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No pending registration requests.
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRegistrations.map((registration) => (
                    <Card key={registration.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{registration.username}</h3>
                              {getRegistrationStatusBadge(registration.status)}
                            </div>
                            <p className="text-sm text-gray-600">{registration.email}</p>
                            {(registration.first_name || registration.last_name) && (
                              <p className="text-sm text-gray-600">
                                {[registration.first_name, registration.last_name].filter(Boolean).join(' ')}
                              </p>
                            )}
                            {registration.phone && (
                              <p className="text-sm text-gray-600">📞 {registration.phone}</p>
                            )}
                            <p className="text-xs text-gray-500">
                              Submitted: {new Date(registration.submitted_at).toLocaleDateString()}
                            </p>
                            {registration.rejection_reason && (
                              <p className="text-sm text-red-600">
                                Reason: {registration.rejection_reason}
                              </p>
                            )}
                          </div>
                          
                          {registration.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveRegistration(registration.id)}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const reason = prompt("Reason for rejection (optional):");
                                  handleRejectRegistration(registration.id, reason || undefined);
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
