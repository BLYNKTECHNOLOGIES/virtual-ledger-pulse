import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Settings2, ArrowUpRight, Briefcase, Clock, Zap, Building2, Ruler, Shield } from "lucide-react";

interface UserProfile {
  user_id: string;
  specialization: string;
  shift: string | null;
  is_active: boolean;
  automation_included: boolean;
}

interface ExchangeAccount {
  id: string;
  account_name: string;
}

interface SizeRange {
  id: string;
  name: string;
  min_amount: number;
  max_amount: number | null;
}

interface TerminalRole {
  id: string;
  name: string;
  hierarchy_level: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  displayName: string;
  onSaved: () => void;
}

export function UserConfigDialog({ open, onOpenChange, userId, username, displayName, onSaved }: Props) {
  const [profile, setProfile] = useState<UserProfile>({
    user_id: userId,
    specialization: "both",
    shift: null,
    is_active: true,
    automation_included: true,
  });
  const [selectedSupervisors, setSelectedSupervisors] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null }[]>([]);
  const [exchangeAccounts, setExchangeAccounts] = useState<ExchangeAccount[]>([]);
  const [sizeRanges, setSizeRanges] = useState<SizeRange[]>([]);
  const [selectedExchanges, setSelectedExchanges] = useState<Set<string>>(new Set());
  const [selectedSizeRanges, setSelectedSizeRanges] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Role management
  const [allRoles, setAllRoles] = useState<TerminalRole[]>([]);
  const [currentRoleIds, setCurrentRoleIds] = useState<string[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [myHierarchyLevel, setMyHierarchyLevel] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get current user's session for hierarchy check
      const sessionStr = localStorage.getItem("userSession");
      const myUserId = sessionStr ? JSON.parse(sessionStr).id : null;

      const [profileRes, usersRes, exchangeRes, sizeRes, exchMapRes, sizeMapRes, supervisorMapRes, rolesRes, userRolesRes, myRolesRes] = await Promise.all([
        supabase.from("terminal_user_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("users").select("id, username, first_name, last_name").eq("status", "ACTIVE"),
        supabase.from("terminal_exchange_accounts").select("id, account_name").eq("is_active", true),
        supabase.from("terminal_order_size_ranges").select("id, name, min_amount, max_amount").eq("is_active", true),
        supabase.from("terminal_user_exchange_mappings").select("exchange_account_id").eq("user_id", userId),
        supabase.from("terminal_user_size_range_mappings").select("size_range_id").eq("user_id", userId),
        supabase.from("terminal_user_supervisor_mappings").select("supervisor_id").eq("user_id", userId),
        supabase.rpc("list_terminal_roles"),
        supabase.from("p2p_terminal_user_roles").select("role_id").eq("user_id", userId),
        myUserId ? supabase.from("p2p_terminal_user_roles").select("role_id").eq("user_id", myUserId) : Promise.resolve({ data: [] }),
      ]);

      if (profileRes.data) {
        setProfile({
          user_id: userId,
          specialization: profileRes.data.specialization,
          shift: profileRes.data.shift,
          is_active: profileRes.data.is_active,
          automation_included: profileRes.data.automation_included,
        });
      }

      const roles: TerminalRole[] = (rolesRes.data || []).map((r: any) => ({
        id: r.id, name: r.name, hierarchy_level: r.hierarchy_level ?? null,
      }));
      setAllRoles(roles);

      // Determine current user's roles for this target user
      const targetRoleIds = (userRolesRes.data || []).map((r: any) => r.role_id);
      setCurrentRoleIds(targetRoleIds);
      setSelectedRoleId(targetRoleIds[0] || "");

      // Determine my hierarchy level (lowest number = highest rank)
      const myRoleIds = ((myRolesRes as any).data || []).map((r: any) => r.role_id);
      const myLevels = myRoleIds
        .map((rid: string) => roles.find(r => r.id === rid)?.hierarchy_level)
        .filter((l: number | null | undefined) => l !== null && l !== undefined) as number[];
      setMyHierarchyLevel(myLevels.length > 0 ? Math.min(...myLevels) : null);

      setAllUsers((usersRes.data || []).filter(u => u.id !== userId));
      setExchangeAccounts(exchangeRes.data || []);
      setSizeRanges(sizeRes.data || []);
      setSelectedExchanges(new Set((exchMapRes.data || []).map(m => m.exchange_account_id)));
      setSelectedSizeRanges(new Set((sizeMapRes.data || []).map(m => m.size_range_id)));
      setSelectedSupervisors(new Set((supervisorMapRes.data || []).map(m => m.supervisor_id)));
    } catch (err) {
      console.error("Error fetching user config:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Upsert profile
      const { error: profileErr } = await supabase
        .from("terminal_user_profiles")
        .upsert({
          user_id: userId,
          specialization: profile.specialization,
          shift: profile.shift || null,
          is_active: profile.is_active,
          automation_included: profile.automation_included,
        }, { onConflict: "user_id" });

      if (profileErr) throw profileErr;

      // Update role if changed
      if (selectedRoleId && !currentRoleIds.includes(selectedRoleId)) {
        const sessionStr = localStorage.getItem("userSession");
        const assignedBy = sessionStr ? JSON.parse(sessionStr).id : undefined;
        // Remove old roles
        for (const oldRoleId of currentRoleIds) {
          await supabase.rpc("remove_terminal_role", { p_user_id: userId, p_role_id: oldRoleId });
        }
        // Assign new role
        const { error: roleErr } = await supabase.rpc("assign_terminal_role", {
          p_user_id: userId,
          p_role_id: selectedRoleId,
          p_assigned_by: assignedBy,
        });
        if (roleErr) throw roleErr;
      }

      // Sync supervisor mappings
      await supabase.from("terminal_user_supervisor_mappings").delete().eq("user_id", userId);
      if (selectedSupervisors.size > 0) {
        const rows = Array.from(selectedSupervisors).map(sid => ({
          user_id: userId,
          supervisor_id: sid,
        }));
        const { error: supErr } = await supabase.from("terminal_user_supervisor_mappings").insert(rows);
        if (supErr) throw supErr;
      }

      // Sync exchange mappings
      await supabase.from("terminal_user_exchange_mappings").delete().eq("user_id", userId);
      if (selectedExchanges.size > 0) {
        const rows = Array.from(selectedExchanges).map(eid => ({
          user_id: userId,
          exchange_account_id: eid,
        }));
        const { error: exchErr } = await supabase.from("terminal_user_exchange_mappings").insert(rows);
        if (exchErr) throw exchErr;
      }

      // Sync size range mappings
      await supabase.from("terminal_user_size_range_mappings").delete().eq("user_id", userId);
      if (selectedSizeRanges.size > 0) {
        const rows = Array.from(selectedSizeRanges).map(sid => ({
          user_id: userId,
          size_range_id: sid,
        }));
        const { error: sizeErr } = await supabase.from("terminal_user_size_range_mappings").insert(rows);
        if (sizeErr) throw sizeErr;
      }

      toast.success("User configuration saved");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error saving user config:", err);
      toast.error(err.message || "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExchange = (id: string) => {
    setSelectedExchanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSizeRange = (id: string) => {
    setSelectedSizeRanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getUserLabel = (u: { first_name: string | null; last_name: string | null; username: string }) =>
    u.first_name && u.last_name ? `${u.first_name} ${u.last_name} (@${u.username})` : `@${u.username}`;

  // Filter roles: only show roles with hierarchy_level strictly greater than my level (lower rank)
  const assignableRoles = allRoles.filter(r => {
    if (myHierarchyLevel === null) return false; // can't assign if no hierarchy
    if (myHierarchyLevel === 0) return true; // Admin can assign all
    if (r.hierarchy_level === null) return true; // roles without level (like Viewer)
    return r.hierarchy_level > myHierarchyLevel; // can only assign roles below
  });

  // Get target user's current hierarchy level
  const targetHierarchyLevel = (() => {
    const levels = currentRoleIds
      .map(rid => allRoles.find(r => r.id === rid)?.hierarchy_level)
      .filter((l): l is number => l !== null && l !== undefined);
    return levels.length > 0 ? Math.min(...levels) : null;
  })();

  // Can current user change this user's role?
  const canChangeRole = (() => {
    if (myHierarchyLevel === null) return false;
    if (myHierarchyLevel === 0) return true; // Admin can change anyone
    if (targetHierarchyLevel === null) return true; // target has no hierarchy role
    return myHierarchyLevel < targetHierarchyLevel; // can only change users below in hierarchy
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Configure: {displayName}
          </DialogTitle>
          <DialogDescription>Set jurisdiction, exchange mappings, and operational config for @{username}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Role */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Terminal Role
              </label>
              {canChangeRole ? (
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                        {r.hierarchy_level !== null && (
                          <span className="text-muted-foreground ml-1">(L{r.hierarchy_level})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  {currentRoleIds.map(rid => {
                    const role = allRoles.find(r => r.id === rid);
                    return role ? (
                      <Badge key={rid} variant="outline" className="text-xs bg-primary/20 text-primary border-primary/30">
                        {role.name}
                      </Badge>
                    ) : null;
                  })}
                  <span className="text-[10px] text-muted-foreground italic">Cannot change — higher or equal rank</span>
                </div>
              )}
            </div>

            {/* Supervisors (multi-select) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" /> Reports To (Supervisors)
              </label>
              {allUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No other users available.</p>
              ) : (
                <div className="space-y-1.5 border border-border rounded-lg p-2 max-h-40 overflow-y-auto">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-1">
                      <Checkbox
                        checked={selectedSupervisors.has(u.id)}
                        onCheckedChange={() => {
                          setSelectedSupervisors(prev => {
                            const next = new Set(prev);
                            next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <span>{getUserLabel(u)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Specialization */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Specialization
              </label>
              <Select
                value={profile.specialization}
                onValueChange={(v) => setProfile(p => ({ ...p, specialization: v }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase Only</SelectItem>
                  <SelectItem value="sales">Sales Only</SelectItem>
                  <SelectItem value="both">Both (Purchase & Sales)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Shift */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Shift
              </label>
              <Select
                value={profile.shift || "__none__"}
                onValueChange={(v) => setProfile(p => ({ ...p, shift: v === "__none__" ? null : v }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No shift assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No shift</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="space-y-3 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" /> Active Status
                </label>
                <Switch
                  checked={profile.is_active}
                  onCheckedChange={(v) => setProfile(p => ({ ...p, is_active: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" /> Include in Automation
                </label>
                <Switch
                  checked={profile.automation_included}
                  onCheckedChange={(v) => setProfile(p => ({ ...p, automation_included: v }))}
                />
              </div>
            </div>

            {/* Exchange Accounts */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Exchange Account Mapping
              </label>
              {exchangeAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No exchange accounts configured yet.</p>
              ) : (
                <div className="space-y-1.5 border border-border rounded-lg p-2">
                  {exchangeAccounts.map(ea => (
                    <label key={ea.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-1">
                      <Checkbox
                        checked={selectedExchanges.has(ea.id)}
                        onCheckedChange={() => toggleExchange(ea.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span>{ea.account_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Size Ranges */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" /> Order Size Range Mapping
              </label>
              {sizeRanges.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No size ranges configured yet.</p>
              ) : (
                <div className="space-y-1.5 border border-border rounded-lg p-2">
                  {sizeRanges.map(sr => (
                    <label key={sr.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-1">
                      <Checkbox
                        checked={selectedSizeRanges.has(sr.id)}
                        onCheckedChange={() => toggleSizeRange(sr.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span>{sr.name}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        ₹{sr.min_amount.toLocaleString()} – {sr.max_amount ? `₹${sr.max_amount.toLocaleString()}` : '∞'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
