import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus, Terminal, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useUmAccess } from "./useUmAccess";
import { Panel } from "@/components/finance-ui/primitives";
import { cn } from "@/lib/utils";
import { Initials, PanelMessage, PanelSkeleton, SearchField, isSystemRole, UM_TABLE } from "./umUi";

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

const ALL_ROLES = "all";

export function TerminalAccessTab() {
  const [assignments, setAssignments] = useState<TerminalUserAssignment[]>([]);
  const [availableRoles, setAvailableRoles] = useState<TerminalRole[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null; email: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>(ALL_ROLES);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  // UM-2A S3: controls follow the server's Terminal rule (assign_terminal_role / remove_terminal_role):
  // only Terminal roles ranked below yours, holding only Terminal access you have.
  const { access, actionsFor } = useUmAccess();
  const canManage = !!access?.terminal?.can_assign;
  const grantable = (roleId: string) => !!access?.terminal?.grantable_role_ids?.includes(roleId);
  const [searchParams] = useSearchParams();
  const personParam = searchParams.get("person");

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

  // Opened from Edit user: narrow the list to that person.
  useEffect(() => {
    if (!personParam || allUsers.length === 0) return;
    const u = allUsers.find((x) => x.id === personParam);
    if (u) setSearchTerm(u.username);
  }, [personParam, allUsers]);

  const handleAssignRole = async () => {
    if (!selectedUserId || !selectedRoleId) {
      toast.error("Please select both a user and a role");
      return;
    }

    try {
      setIsAssigning(true);

      // Get current user id from session cache
      const { getSessionUserId } = await import("@/lib/session-cache");
      const assignedBy = getSessionUserId() || undefined;

      const { error } = await supabase.rpc("assign_terminal_role", {
        p_user_id: selectedUserId,
        p_role_id: selectedRoleId,
        p_assigned_by: assignedBy,
      });

      if (error) {
        console.error("Error assigning terminal role:", error);
        toast.error(error.message || "Failed to assign terminal role");
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

  const [roleToRemove, setRoleToRemove] = useState<{userId: string; roleId: string; roleName: string; username: string} | null>(null);

  const handleRemoveRole = async (userId: string, roleId: string, roleName: string, username: string) => {
    setRoleToRemove({ userId, roleId, roleName, username });
  };

  const confirmRemoveRole = async () => {
    if (!roleToRemove) return;
    const { userId, roleId, roleName, username } = roleToRemove;

    try {
      const { error } = await supabase.rpc("remove_terminal_role", {
        p_user_id: userId,
        p_role_id: roleId,
      });

      if (error) {
        console.error("Error removing terminal role:", error);
        toast.error(error.message || "Failed to remove terminal role");
        setRoleToRemove(null);
        return;
      }

      toast.success(`Removed "${roleName}" from ${username}`);
      await fetchData();
    } catch (err) {
      console.error("Error removing role:", err);
      toast.error("Failed to remove terminal role");
    } finally {
      setRoleToRemove(null);
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
    (u) => actionsFor(u.id).terminal && (
      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.first_name && u.first_name.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
      (u.last_name && u.last_name.toLowerCase().includes(userSearchTerm.toLowerCase())))
  );

  const displayName = (firstName: string | null, lastName: string | null, username: string) =>
    firstName && lastName ? `${firstName} ${lastName}` : username;

  /* ── Display only: role filter + stable A–Z order ── */
  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    assignments.forEach((a) => a.roles.forEach((r) => m.set(r.id, (m.get(r.id) || 0) + 1)));
    return m;
  }, [assignments]);
  const rolesInUse = availableRoles.filter((r) => (roleCounts.get(r.id) || 0) > 0);
  // If the chosen role filter has nobody left on it, fall back to showing everyone.
  const activeRoleFilter = roleFilter !== ALL_ROLES && rolesInUse.some((r) => r.id === roleFilter) ? roleFilter : ALL_ROLES;
  const visibleAssignments = filteredAssignments
    .filter((a) => activeRoleFilter === ALL_ROLES || a.roles.some((r) => r.id === activeRoleFilter))
    .sort((a, b) =>
      displayName(a.firstName, a.lastName, a.username).localeCompare(displayName(b.firstName, b.lastName, b.username)),
    );

  const roleChips = (assignment: TerminalUserAssignment) => (
    <div className="flex flex-wrap gap-1">
      {assignment.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
      {assignment.roles.map((role) => (
        <span
          key={role.id}
          title={role.description || undefined}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-2 pr-0.5 text-[11px] font-medium",
            isSystemRole(role.name) ? "border-info/25 bg-info/10 text-info" : "border-border bg-muted/50 text-foreground",
          )}
        >
          {role.name}
          {canManage && grantable(role.id) && actionsFor(assignment.userId).terminal && (
            <button
              type="button"
              onClick={() => handleRemoveRole(assignment.userId, role.id, role.name, assignment.username)}
              className="-my-1 ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${role.name} from ${displayName(assignment.firstName, assignment.lastName, assignment.username)}`}
              title={`Remove ${role.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <>
    <Panel
      title="Terminal access"
      description="Who can open the P2P Trading Terminal, and with which Terminal role. Terminal roles are separate from ERP roles."
      bodyClassName="p-0 sm:p-0"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-8 gap-1.5" aria-label="Refresh Terminal access">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canManage && (
            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  Grant access
                </Button>
              </DialogTrigger>
              <DialogContent className="md:max-w-md">
                <DialogHeader>
                  <DialogTitle>Grant Terminal access</DialogTitle>
                  <DialogDescription>
                    Pick a person and the Terminal role they should have. Only active ERP users are listed.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="grant-user">Person</Label>
                    <Input
                      placeholder="Type to narrow the list…"
                      aria-label="Narrow the list of people"
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                    />
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger id="grant-user">
                        <SelectValue placeholder={`Choose from ${filteredUsersForDialog.length} people`} />
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
                  <div className="space-y-1.5">
                    <Label htmlFor="grant-role">Terminal role</Label>
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger id="grant-role">
                        <SelectValue placeholder="Choose a Terminal role" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.filter((role) => grantable(role.id)).map((role) => (
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
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAssignRole}
                    disabled={!selectedUserId || !selectedRoleId || isAssigning}
                  >
                    {isAssigning ? "Granting..." : "Grant access"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search name, username or email"
          label="Search people with Terminal access"
          className="sm:min-w-[240px] sm:flex-1"
        />
        <Select value={activeRoleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[240px]" aria-label="Filter by Terminal role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROLES}>All Terminal roles ({assignments.length})</SelectItem>
            {rolesInUse.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name} ({roleCounts.get(r.id) || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <PanelSkeleton rows={5} />
      ) : visibleAssignments.length > 0 ? (
        <div className="responsive-list">
          <div className="responsive-list-table">
            <table className={UM_TABLE}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="hidden @[56rem]:table-cell">Email</th>
                  <th>Terminal role</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssignments.map((assignment) => {
                  const name = displayName(assignment.firstName, assignment.lastName, assignment.username);
                  return (
                    <tr key={assignment.userId}>
                      <td>
                        <div className="flex min-w-[11rem] items-center gap-2.5">
                          <Initials name={name} />
                          <div className="min-w-0 [overflow-wrap:normal]">
                            <p className="font-medium text-foreground">{name}</p>
                            <p className="text-xs text-muted-foreground">@{assignment.username}</p>
                            <p className="break-all text-xs text-muted-foreground @[56rem]:hidden">{assignment.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden break-all text-muted-foreground @[56rem]:table-cell">{assignment.email}</td>
                      <td>{roleChips(assignment)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="responsive-list-cards divide-y divide-border">
            {visibleAssignments.map((assignment) => {
              const name = displayName(assignment.firstName, assignment.lastName, assignment.username);
              return (
                <li key={assignment.userId} className="flex items-start gap-3 px-4 py-3">
                  <Initials name={name} className="mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div>
                      <p className="font-medium text-foreground">{name}</p>
                      <p className="break-all text-xs text-muted-foreground">@{assignment.username} · {assignment.email}</p>
                    </div>
                    {roleChips(assignment)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : assignments.length > 0 ? (
        <PanelMessage icon={Terminal} title="No one matches these filters">
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { setSearchTerm(""); setRoleFilter(ALL_ROLES); }}>
            Clear filters
          </Button>
        </PanelMessage>
      ) : (
        <PanelMessage icon={Terminal} title="No one has Terminal access yet">
          Use “Grant access” to give someone a Terminal role.
        </PanelMessage>
      )}
      {!isLoading && visibleAssignments.length > 0 && (
        <p className="px-4 pb-3 pt-3 text-xs text-muted-foreground sm:px-5">
          {visibleAssignments.length === assignments.length
            ? `${assignments.length} ${assignments.length === 1 ? "person has" : "people have"} Terminal access`
            : `Showing ${visibleAssignments.length} of ${assignments.length} people with Terminal access`}
        </p>
      )}
    </Panel>

    <AlertDialog open={!!roleToRemove} onOpenChange={(open) => !open && setRoleToRemove(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this Terminal role?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove “{roleToRemove?.roleName}” from {roleToRemove?.username}. If it's their only Terminal role, they lose Terminal access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRemoveRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
