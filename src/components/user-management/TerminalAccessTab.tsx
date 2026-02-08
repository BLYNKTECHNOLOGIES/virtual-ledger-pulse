import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Search, UserPlus, Trash2, Terminal, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PermissionGate } from "@/components/PermissionGate";

interface TerminalRole {
  id: string;
  name: string;
  description: string | null;
}

interface TerminalUserAssignment {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roles: TerminalRole[];
}

export function TerminalAccessTab() {
  const [assignments, setAssignments] = useState<TerminalUserAssignment[]>([]);
  const [availableRoles, setAvailableRoles] = useState<TerminalRole[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null; email: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch terminal roles and all users in parallel
      const [rolesRes, usersRes] = await Promise.all([
        supabase.rpc("list_terminal_roles"),
        supabase.from("users").select("id, username, first_name, last_name, email").eq("status", "ACTIVE"),
      ]);

      const roles: TerminalRole[] = (rolesRes.data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
      }));
      setAvailableRoles(roles);
      setAllUsers(usersRes.data || []);

      // For each user, check if they have terminal roles
      const userRoleAssignments: TerminalUserAssignment[] = [];

      // Fetch all terminal user role assignments
      const { data: allAssignments, error: assignError } = await supabase
        .from("p2p_terminal_user_roles")
        .select("user_id, role_id");

      if (assignError) {
        console.error("Error fetching terminal assignments:", assignError);
      }

      // Group by user
      const userRoleMap = new Map<string, string[]>();
      (allAssignments || []).forEach((a) => {
        const existing = userRoleMap.get(a.user_id) || [];
        existing.push(a.role_id);
        userRoleMap.set(a.user_id, existing);
      });

      // Build assignment list
      const usersData = usersRes.data || [];
      for (const [userId, roleIds] of userRoleMap) {
        const user = usersData.find((u) => u.id === userId);
        if (!user) continue;
        const userRoles = roleIds
          .map((rid) => roles.find((r) => r.id === rid))
          .filter(Boolean) as TerminalRole[];

        userRoleAssignments.push({
          userId: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          roles: userRoles,
        });
      }

      setAssignments(userRoleAssignments);
    } catch (err) {
      console.error("Error fetching terminal access data:", err);
      toast.error("Failed to load terminal access data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssignRole = async () => {
    if (!selectedUserId || !selectedRoleId) {
      toast.error("Please select both a user and a role");
      return;
    }

    try {
      setIsAssigning(true);

      // Get current user id from localStorage session
      const sessionStr = localStorage.getItem("userSession");
      const assignedBy = sessionStr ? JSON.parse(sessionStr).id : undefined;

      const { error } = await supabase.rpc("assign_terminal_role", {
        p_user_id: selectedUserId,
        p_role_id: selectedRoleId,
        p_assigned_by: assignedBy,
      });

      if (error) {
        console.error("Error assigning terminal role:", error);
        toast.error("Failed to assign terminal role");
        return;
      }

      toast.success("Terminal role assigned successfully");
      setAssignDialogOpen(false);
      setSelectedUserId("");
      setSelectedRoleId("");
      await fetchData();
    } catch (err) {
      console.error("Error assigning role:", err);
      toast.error("Failed to assign terminal role");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveRole = async (userId: string, roleId: string, roleName: string, username: string) => {
    if (!window.confirm(`Remove "${roleName}" role from ${username}? They may lose terminal access.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc("remove_terminal_role", {
        p_user_id: userId,
        p_role_id: roleId,
      });

      if (error) {
        console.error("Error removing terminal role:", error);
        toast.error("Failed to remove terminal role");
        return;
      }

      toast.success(`Removed "${roleName}" from ${username}`);
      await fetchData();
    } catch (err) {
      console.error("Error removing role:", err);
      toast.error("Failed to remove terminal role");
    }
  };

  const filteredAssignments = assignments.filter(
    (a) =>
      a.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.firstName && a.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.lastName && a.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredUsersForDialog = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.first_name && u.first_name.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
      (u.last_name && u.last_name.toLowerCase().includes(userSearchTerm.toLowerCase()))
  );

  const displayName = (firstName: string | null, lastName: string | null, username: string) =>
    firstName && lastName ? `${firstName} ${lastName}` : username;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Terminal className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Terminal Access Management</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Grant or revoke P2P Trading Terminal access for users
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <PermissionGate permissions={["user_management_manage"]} showFallback={false}>
              <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <UserPlus className="h-4 w-4 mr-1" />
                    Grant Access
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Grant Terminal Access</DialogTitle>
                    <DialogDescription>
                      Select a user and assign them a terminal role to grant access.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">User</label>
                      <div className="space-y-2">
                        <Input
                          placeholder="Search users..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                        />
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredUsersForDialog.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {displayName(user.first_name, user.last_name, user.username)} ({user.username})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Terminal Role</label>
                      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              <div className="flex flex-col">
                                <span>{role.name}</span>
                                {role.description && (
                                  <span className="text-xs text-muted-foreground">{role.description}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAssignRole}
                      disabled={!selectedUserId || !selectedRoleId || isAssigning}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {isAssigning ? "Assigning..." : "Grant Access"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </PermissionGate>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users with terminal access..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <Badge variant="secondary" className="ml-auto">
            {assignments.length} user{assignments.length !== 1 ? "s" : ""} with access
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            <span className="ml-2 text-sm text-muted-foreground">Loading terminal access...</span>
          </div>
        ) : filteredAssignments.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Terminal Role(s)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((assignment) => (
                  <TableRow key={assignment.userId}>
                    <TableCell className="font-medium">
                      {displayName(assignment.firstName, assignment.lastName, assignment.username)}
                      <span className="block text-xs text-muted-foreground">@{assignment.username}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{assignment.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {assignment.roles.map((role) => (
                          <Badge
                            key={role.id}
                            variant={role.name.toLowerCase() === "admin" ? "destructive" : "default"}
                            className="text-xs"
                          >
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <PermissionGate permissions={["user_management_manage"]} showFallback={false}>
                        <div className="flex justify-end gap-1">
                          {assignment.roles.map((role) => (
                            <Button
                              key={role.id}
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveRole(assignment.userId, role.id, role.name, assignment.username)
                              }
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Remove {role.name}
                            </Button>
                          ))}
                        </div>
                      </PermissionGate>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Terminal className="h-10 w-10 opacity-30" />
            <p className="text-sm">No users have terminal access yet.</p>
            <p className="text-xs">Use "Grant Access" to assign terminal roles to users.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
