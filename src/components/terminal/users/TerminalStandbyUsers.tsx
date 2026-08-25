import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Fingerprint, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { filterOutDeletedUsers } from "@/lib/deletedUser";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { toast } from "sonner";

interface StandbyUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  hasBiometrics: boolean;
}

interface RoleOption {
  id: string;
  name: string;
}

/**
 * Users who can sign into the Terminal (ERP grant "Terminal Access (Standby)")
 * but have no Terminal role yet — they are stuck in standby mode and can only
 * register their biometrics until a role is assigned here.
 */
export function TerminalStandbyUsers({ onAssigned }: { onAssigned?: () => void }) {
  const { hasPermission, isTerminalAdmin } = useTerminalAuth();
  const canAssign = hasPermission("terminal_users_role_assign") || isTerminalAdmin;

  const [users, setUsers] = useState<StandbyUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rolesRes, usersRes, grantsRes, userRolesRes, terminalRolesRes] = await Promise.all([
        supabase.rpc("list_terminal_roles"),
        supabase.from("users").select("id, username, first_name, last_name, email").eq("status", "ACTIVE"),
        supabase.from("role_permissions").select("role_id, permission"),
        supabase.from("user_roles").select("user_id, role_id"),
        supabase.from("p2p_terminal_user_roles").select("user_id"),
      ]);

      setRoles((rolesRes.data || []).map((r: any) => ({ id: r.id, name: r.name })));

      // ERP roles that grant Terminal sign-in (current key + legacy umbrella keys).
      const TERMINAL_GRANTS = new Set(["terminal_view", "terminal_manage", "admin_access", "super_admin_access"]);
      const grantingRoleIds = new Set(
        (grantsRes.data || []).filter((g: any) => TERMINAL_GRANTS.has(g.permission)).map((g: any) => g.role_id)
      );
      const eligibleUserIds = new Set(
        (userRolesRes.data || []).filter((ur: any) => grantingRoleIds.has(ur.role_id)).map((ur: any) => ur.user_id)
      );
      const withTerminalRole = new Set((terminalRolesRes.data || []).map((r: any) => r.user_id));

      const activeUsers = filterOutDeletedUsers((usersRes.data || []) as any[]) as any[];
      const standby = activeUsers.filter((u) => eligibleUserIds.has(u.id) && !withTerminalRole.has(u.id));

      // Biometric enrolment status per standby user.
      const bioResults = await Promise.all(
        standby.map(async (u) => {
          try {
            const { data } = await supabase.rpc("get_webauthn_credentials", { p_user_id: u.id });
            return Array.isArray(data) && data.length > 0;
          } catch {
            return false;
          }
        })
      );

      setUsers(
        standby.map((u, i) => ({
          id: u.id,
          username: u.username,
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          hasBiometrics: bioResults[i],
        }))
      );
    } catch (err) {
      console.error("Error loading standby users:", err);
      toast.error("Failed to load standby users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assign = async (userId: string) => {
    const roleId = pendingRole[userId];
    if (!roleId) return;
    setAssigningId(userId);
    try {
      const { getSessionUserId } = await import("@/lib/session-cache");
      const { error } = await supabase.rpc("assign_terminal_role", {
        p_user_id: userId,
        p_role_id: roleId,
        p_assigned_by: getSessionUserId() || undefined,
      });
      if (error) {
        toast.error("Failed to assign role");
        return;
      }
      toast.success("Terminal role assigned — standby lifted");
      await fetchData();
      onAssigned?.();
    } finally {
      setAssigningId(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(q)
    );
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-warning" />
          Standby — no Terminal role assigned
          <Badge variant="outline" className="text-xs t-mono ml-1">
            {users.length}
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={fetchData}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These users can sign into the Terminal but only reach biometric enrolment. Assign a role to
          unlock the workspace for them.
        </p>

        {users.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search standby users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/20 border-border text-sm"
            />
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No users are waiting in standby.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Biometrics</TableHead>
                  <TableHead className="text-xs">Assign role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm">
                      <div className="text-foreground">
                        {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                      </div>
                      <div className="text-xs text-muted-foreground t-mono">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      {u.hasBiometrics ? (
                        <Badge variant="outline" className="text-xs border-success/40 text-success">
                          <ShieldCheck className="h-3 w-3" /> Registered
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-warning/40 text-warning">
                          <Fingerprint className="h-3 w-3" /> Not registered
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canAssign ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={pendingRole[u.id] || ""}
                            onValueChange={(v) => setPendingRole((p) => ({ ...p, [u.id]: v }))}
                          >
                            <SelectTrigger className="h-8 w-40 text-xs text-foreground">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r.id} value={r.id} className="text-xs text-foreground">
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!pendingRole[u.id] || assigningId === u.id}
                            onClick={() => assign(u.id)}
                          >
                            {assigningId === u.id ? "Assigning…" : "Assign"}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No permission to assign</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
