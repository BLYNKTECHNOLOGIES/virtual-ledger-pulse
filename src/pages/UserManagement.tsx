
import { useState, useEffect, useMemo, useCallback } from "react";
import { OptimizedTabs, OptimizedTabsContent, OptimizedTabsList, OptimizedTabsTrigger } from "@/components/ui/optimized-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { AddUserDialog } from "@/components/AddUserDialog";
import { AssignRoleDialog } from "@/components/users/AssignRoleDialog";
import { RoleManagement } from "@/components/roles/RoleManagement";
import { UsersTab } from "@/components/user-management/UsersTab";
import { ApprovalsTab } from "@/components/user-management/ApprovalsTab";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
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
  const { users, deleteUser, refreshUsers, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Debounce search term to reduce API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Debug function to test data fetching
  const debugDataFetching = async () => {
    console.log('=== DEBUGGING DATA FETCHING ===');
    
    // Check current user
    const { data: user, error: userError } = await supabase.auth.getUser();
    console.log("Current logged-in user:", user);
    console.log("User error:", userError);
    
    // Test users table
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("*");
    console.log("All users from direct query:", usersData);
    console.log("Users error:", usersError);
    
    // Test pending registrations
    const { data: pendingData, error: pendingError } = await supabase
      .from("pending_registrations")
      .select("*");
    console.log("Pending registrations from direct query:", pendingData);
    console.log("Pending error:", pendingError);
    
    // Test roles
    const { data: rolesData, error: rolesError } = await supabase
      .from("roles")
      .select("*");
    console.log("Roles from direct query:", rolesData);
    console.log("Roles error:", rolesError);
    
    console.log('=== END DEBUG ===');
  };

  // Fetch pending registrations with optimized query
  const { data: pendingRegistrations, refetch: refetchPendingRegistrations, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending_registrations'],
    queryFn: async () => {
      console.log('Fetching pending registrations...');
      const { data, error } = await supabase
        .from('pending_registrations')
        .select('*')
        .order('submitted_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching pending registrations:', error);
        throw error;
      }
      
      console.log('Pending registrations fetched:', data);
      return data as PendingRegistration[];
    },
  });

  useEffect(() => {
    console.log('UserManagement component mounted');
    console.log('Current users from auth:', users);
    console.log('Loading state:', loading);
    refreshUsers();
  }, [refreshUsers]);

  // Debug log users whenever they change
  useEffect(() => {
    console.log('Users updated in UserManagement:', users);
  }, [users]);

  const handleDeleteUser = useCallback(async (id: string, username: string) => {
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
  }, [deleteUser, toast]);

  const handleManageRoles = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setShowRoleDialog(true);
  }, []);

  const handleRolesUpdated = useCallback(() => {
    refreshUsers();
  }, [refreshUsers]);

  const handleApproveRegistration = useCallback(async (registrationId: string) => {
    try {
      console.log('Approving registration:', registrationId);
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
      console.error('Error approving registration:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve registration",
        variant: "destructive"
      });
    }
  }, [toast, refetchPendingRegistrations, refreshUsers]);

  const handleRejectRegistration = useCallback(async (registrationId: string, reason?: string) => {
    try {
      console.log('Rejecting registration:', registrationId, 'Reason:', reason);
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
      console.error('Error rejecting registration:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject registration",
        variant: "destructive"
      });
    }
  }, [toast, refetchPendingRegistrations]);

  const pendingCount = useMemo(() => 
    pendingRegistrations?.filter(reg => reg.status === 'PENDING').length || 0, 
    [pendingRegistrations]
  );

  console.log('Rendering UserManagement with:', {
    users: users?.length || 0,
    pendingCount,
    loading,
    pendingLoading
  });

  if (loading || pendingLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Manage system users, roles, and permissions</p>
        </div>
        <Button onClick={debugDataFetching} variant="outline" className="bg-red-100 text-red-800">
          Debug Data
        </Button>
      </div>

      <OptimizedTabs defaultValue="users" className="space-y-6">
        <OptimizedTabsList>
          <OptimizedTabsTrigger value="users">
            Users ({users?.length || 0})
          </OptimizedTabsTrigger>
          <OptimizedTabsTrigger value="approvals" className="relative">
            Approvals
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5">
                {pendingCount}
              </Badge>
            )}
          </OptimizedTabsTrigger>
          <OptimizedTabsTrigger value="roles">Roles</OptimizedTabsTrigger>
        </OptimizedTabsList>

        <OptimizedTabsContent value="users" className="space-y-6" keepMounted>
          <UsersTab
            users={users || []}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onAddUser={() => setShowAddDialog(true)}
            onEditUser={(userId) => console.log('Edit user:', userId)}
            onDeleteUser={handleDeleteUser}
            onManageRoles={handleManageRoles}
          />
        </OptimizedTabsContent>

        <OptimizedTabsContent value="approvals" className="space-y-6" keepMounted>
          <ApprovalsTab
            registrations={pendingRegistrations || []}
            onApprove={handleApproveRegistration}
            onReject={handleRejectRegistration}
          />
        </OptimizedTabsContent>

        <OptimizedTabsContent value="roles" keepMounted>
          <RoleManagement />
        </OptimizedTabsContent>
      </OptimizedTabs>

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
