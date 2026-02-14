import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Search, UserPlus, Trash2, RefreshCw, Shield, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { UserConfigDialog } from "./UserConfigDialog";

interface TerminalRole {
  id: string;
  name: string;
  description: string | null;
  hierarchy_level: number | null;
}

interface UserAssignment {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roles: TerminalRole[];
  supervisorName: string | null;
  specialization: string | null;
  shift: string | null;
  isActive: boolean;
}

export function TerminalUsersList() {
  const { hasPermission } = useTerminalAuth();
  const canManage = hasPermission("terminal_users_manage");

  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [availableRoles, setAvailableRoles] = useState<TerminalRole[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null; email: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [configUserId, setConfigUserId] = useState<string | null>(null);
  const [configUsername, setConfigUsername] = useState("");
  const [configDisplayName, setConfigDisplayName] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [rolesRes, usersRes, profilesRes] = await Promise.all([
        supabase.rpc("list_terminal_roles"),
        supabase.from("users").select("id, username, first_name, last_name, email").eq("status", "ACTIVE"),
        supabase.from("terminal_user_profiles").select("user_id, reports_to, specialization, shift, is_active"),
      ]);

      const roles: TerminalRole[] = (rolesRes.data || []).map((r: any) => ({
        id: r.id, name: r.name, description: r.description, hierarchy_level: r.hierarchy_level ?? null,
      }));
      setAvailableRoles(roles);
      const usersData = usersRes.data || [];
      setAllUsers(usersData);

      const profilesMap = new Map<string, any>();
      (profilesRes.data || []).forEach(p => profilesMap.set(p.user_id, p));

      const usersMap = new Map<string, any>();
      usersData.forEach(u => usersMap.set(u.id, u));

      const { data: allAssignments } = await supabase
        .from("p2p_terminal_user_roles")
        .select("user_id, role_id");

      const userRoleMap = new Map<string, string[]>();
      (allAssignments || []).forEach((a) => {
        const existing = userRoleMap.get(a.user_id) || [];
        existing.push(a.role_id);
        userRoleMap.set(a.user_id, existing);
      });

      const result: UserAssignment[] = [];
      for (const [userId, roleIds] of userRoleMap) {
        const user = usersMap.get(userId);
        if (!user) continue;
        const profile = profilesMap.get(userId);
        const supervisorUser = profile?.reports_to ? usersMap.get(profile.reports_to) : null;
        result.push({
          userId: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          roles: roleIds.map((rid) => roles.find((r) => r.id === rid)).filter(Boolean) as TerminalRole[],
          supervisorName: supervisorUser
            ? (supervisorUser.first_name && supervisorUser.last_name
              ? `${supervisorUser.first_name} ${supervisorUser.last_name}`
              : supervisorUser.username)
            : null,
          specialization: profile?.specialization || null,
          shift: profile?.shift || null,
          isActive: profile?.is_active !== false,
        });
      }

      // Sort by hierarchy level (highest first)
      result.sort((a, b) => {
        const aLevel = Math.min(...a.roles.map(r => r.hierarchy_level ?? 99));
        const bLevel = Math.min(...b.roles.map(r => r.hierarchy_level ?? 99));
        return aLevel - bLevel;
      });

      setAssignments(result);
    } catch (err) {
      console.error("Error fetching terminal users:", err);
      toast.error("Failed to load terminal users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAssign = async () => {
    if (!selectedUserId || !selectedRoleId) return;
    try {
      setIsAssigning(true);
      const sessionStr = localStorage.getItem("userSession");
      const assignedBy = sessionStr ? JSON.parse(sessionStr).id : undefined;
      const { error } = await supabase.rpc("assign_terminal_role", {
        p_user_id: selectedUserId,
        p_role_id: selectedRoleId,
        p_assigned_by: assignedBy,
      });
      if (error) { toast.error("Failed to assign role"); return; }
      toast.success("Role assigned");
      setAssignDialogOpen(false);
      setSelectedUserId("");
      setSelectedRoleId("");
      await fetchData();
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemove = async (userId: string, roleId: string, roleName: string, username: string) => {
    if (!window.confirm(`Remove "${roleName}" from ${username}?`)) return;
    const { error } = await supabase.rpc("remove_terminal_role", { p_user_id: userId, p_role_id: roleId });
    if (error) { toast.error("Failed to remove role"); return; }
    toast.success(`Removed "${roleName}" from ${username}`);
    await fetchData();
  };

  const displayName = (f: string | null, l: string | null, u: string) =>
    f && l ? `${f} ${l}` : u;

  const filtered = assignments.filter(
    (a) =>
      a.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.firstName && a.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.lastName && a.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredUsers = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const roleBadgeClass = (name: string, level: number | null) => {
    if (level === 0 || name.toLowerCase() === 'admin') return "bg-red-500/20 text-red-400 border-red-500/30";
    if (level === 1) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (level === 2) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    if (level === 3) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (level === 4) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    if (level === 5) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (name.toLowerCase() === 'viewer') return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    return "bg-primary/20 text-primary border-primary/30";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 bg-muted/20 border-border text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">
            {assignments.length} user{assignments.length !== 1 ? "s" : ""}
          </Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs">
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Grant Access
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Grant Terminal Access</DialogTitle>
                  <DialogDescription>Select a user and assign a terminal role.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">User</label>
                    <Input
                      placeholder="Search users..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select user" /></SelectTrigger>
                      <SelectContent>
                        {filteredUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {displayName(u.first_name, u.last_name, u.username)} (@{u.username})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Terminal Role</label>
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                            {role.hierarchy_level !== null && (
                              <span className="text-muted-foreground ml-1">(L{role.hierarchy_level})</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleAssign} disabled={!selectedUserId || !selectedRoleId || isAssigning}>
                    {isAssigning ? "Assigning..." : "Grant Access"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Shield className="h-10 w-10 opacity-20" />
          <p className="text-sm">No terminal users found.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="text-xs font-medium text-muted-foreground">User</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Role</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Reports To</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Config</TableHead>
                {canManage && <TableHead className="text-xs font-medium text-muted-foreground text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.userId} className={`border-border ${!a.isActive ? "opacity-50" : ""}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{displayName(a.firstName, a.lastName, a.username)}</div>
                    <div className="text-xs text-muted-foreground">@{a.username}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {a.roles.map((r) => (
                        <Badge key={r.id} variant="outline" className={`text-xs ${roleBadgeClass(r.name, r.hierarchy_level)}`}>
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.supervisorName ? (
                      <span className="text-xs text-muted-foreground">{a.supervisorName}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {a.specialization && a.specialization !== "both" && (
                        <Badge variant="secondary" className="text-[10px]">{a.specialization}</Badge>
                      )}
                      {a.shift && (
                        <Badge variant="secondary" className="text-[10px] bg-muted/30">{a.shift}</Badge>
                      )}
                      {!a.isActive && (
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Inactive</Badge>
                      )}
                    </div>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setConfigUserId(a.userId);
                            setConfigUsername(a.username);
                            setConfigDisplayName(displayName(a.firstName, a.lastName, a.username));
                          }}
                        >
                          <Settings2 className="h-3 w-3 mr-1" /> Config
                        </Button>
                        {a.roles.map((r) => (
                          <Button
                            key={r.id}
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleRemove(a.userId, r.id, r.name, a.username)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> {r.name}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* User Config Dialog */}
      {configUserId && (
        <UserConfigDialog
          open={!!configUserId}
          onOpenChange={(open) => { if (!open) setConfigUserId(null); }}
          userId={configUserId}
          username={configUsername}
          displayName={configDisplayName}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
